import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import { ChildProcess, spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");

const app = express();
app.use(
  cors({
    origin: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-webhook-token"],
  })
);
app.use(express.json({ limit: "2mb" }));

const PORT = Number(process.env.SAIBWEB_WEBHOOK_PORT ?? 3333);
const DEFAULT_SLOWMO = process.env.SAIBWEB_SLOWMO ?? "250";
const RECOVER_ON_BOOT = process.env.SAIBWEB_RECOVER_PROCESSING_ON_BOOT === "1";
const PROCESSING_RECOVERY_MINUTES = Number(
  process.env.SAIBWEB_PROCESSING_RECOVERY_MINUTES ?? 20
);
const AUTO_DRAIN_INTERVAL_MS = Number(process.env.SAIBWEB_AUTO_DRAIN_INTERVAL_MS ?? 15000);
const AUTO_DRAIN_PRIORITY_WINDOW_MINUTES = Number(
  process.env.SAIBWEB_AUTO_DRAIN_PRIORITY_WINDOW_MINUTES ?? 180
);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/**
 * =====================
 * FILA EM MEMÓRIA (FIFO)
 * =====================
 */
const queue: string[] = [];
const queuedOrRunning = new Set<string>();
let isRunning = false;
let lastRunAt: number | null = null;
let httpServer: ReturnType<typeof app.listen> | null = null;
let activeChild: ChildProcess | null = null;
let isShuttingDown = false;
let autoDrainTimer: NodeJS.Timeout | null = null;

function getErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "object" && err !== null) {
    const maybeMessage = (err as { message?: unknown }).message;
    if (typeof maybeMessage === "string" && maybeMessage.trim()) return maybeMessage;

    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
  return String(err ?? "Erro desconhecido");
}

/**
 * =====================
 * HELPERS
 * =====================
 */
function extractOrderId(payload: any): string | null {
  const id = payload?.record?.id ?? payload?.id ?? payload?.order_id ?? null;
  return id ? String(id) : null;
}

function buildCommand() {
  if (process.platform === "win32") {
    return {
      command: "cmd.exe",
      args: ["/c", "npx", "tsx", path.resolve(PROJECT_ROOT, "automation", "saibweb-runner.ts")],
      printable: `cmd.exe /c npx tsx ${path.resolve(PROJECT_ROOT, "automation", "saibweb-runner.ts")}`,
    };
  }

  return {
    command: "npx",
    args: ["tsx", path.resolve(PROJECT_ROOT, "automation", "saibweb-runner.ts")],
    printable: `npx tsx ${path.resolve(PROJECT_ROOT, "automation", "saibweb-runner.ts")}`,
  };
}

function buildChildEnv(orderId?: string | null): NodeJS.ProcessEnv {
  const childEnv: NodeJS.ProcessEnv = { ...process.env };

  for (const key of Object.keys(childEnv)) {
    if (key.startsWith("CODEX_")) {
      delete childEnv[key];
    }
  }

  return {
    ...childEnv,
    SAIBWEB_SLOWMO: String(process.env.SAIBWEB_SLOWMO ?? DEFAULT_SLOWMO),
    SAIBWEB_KEEP_OPEN: "0",
    SAIBWEB_PAUSE: "0",
    ...(orderId ? { ORDER_ID: String(orderId) } : {}), // ✅ agora o runner usa isso
  };
}

function requireWebhookAuth(
  _req: express.Request,
  _res: express.Response,
  next: express.NextFunction
) {
  next();
}

async function recoverStuckOrders() {
  const safeMinutes = Number.isFinite(PROCESSING_RECOVERY_MINUTES)
    ? Math.max(1, PROCESSING_RECOVERY_MINUTES)
    : 20;
  const cutoffIso = new Date(Date.now() - safeMinutes * 60 * 1000).toISOString();

  console.log(
    `🩺 Verificando pedidos órfãos em PROCESSING com created_at <= ${cutoffIso}...`
  );

  const { data: candidates, error: candidatesError } = await supabase
    .from("orders")
    .select("id, order_number, created_at")
    .eq("saibweb_status", "PROCESSING")
    .lte("created_at", cutoffIso);

  if (candidatesError) {
    console.error("❌ Falha ao buscar pedidos PROCESSING para recovery:", candidatesError);
    return;
  }

  const recoverable = Array.isArray(candidates) ? candidates : [];
  if (recoverable.length === 0) {
    console.log("👌 Nenhum pedido PROCESSING antigo o suficiente para recuperar.");
    return;
  }

  const idsToRecover = recoverable.map((row: any) => row.id).filter(Boolean);

  const { data: recovered, error } = await supabase
    .from("orders")
    .update({
      saibweb_status: "PENDING",
      saibweb_error: `Recuperado automaticamente após reinício do serviço webhook (>${safeMinutes} min em PROCESSING).`,
    })
    .in("id", idsToRecover)
    .select("id, order_number");

  if (error) {
    console.error("❌ Falha ao recuperar pedidos PROCESSING:", error);
    return;
  }

  console.log(
    "♻️ Pedidos recuperados para PENDING:",
    recovered.map((row: any) => row.order_number || row.id)
  );
}

async function recoverBrowserEnqueueFailures() {
  const priorityMinutes = Number.isFinite(AUTO_DRAIN_PRIORITY_WINDOW_MINUTES)
    ? Math.max(5, AUTO_DRAIN_PRIORITY_WINDOW_MINUTES)
    : 180;
  const cutoffIso = new Date(Date.now() - priorityMinutes * 60 * 1000).toISOString();

  const { data: candidates, error: candidatesError } = await supabase
    .from("orders")
    .select("id, order_number, saibweb_error, created_at")
    .eq("saibweb_status", "ERROR")
    .gte("created_at", cutoffIso)
    .or("saibweb_error.ilike.%Failed to fetch%,saibweb_error.ilike.%NetworkError%,saibweb_error.ilike.%Load failed%");

  if (candidatesError) {
    console.error("❌ Falha ao buscar pedidos com erro de enfileiramento no navegador:", candidatesError);
    return;
  }

  const recoverable = Array.isArray(candidates) ? candidates : [];
  if (recoverable.length === 0) return;

  const idsToRecover = recoverable.map((row: any) => row.id).filter(Boolean);

  const { data: recovered, error } = await supabase
    .from("orders")
    .update({
      saibweb_status: "PENDING",
      saibweb_error: "Recuperado automaticamente apos falha de enfileiramento no navegador.",
    })
    .in("id", idsToRecover)
    .select("id, order_number");

  if (error) {
    console.error("❌ Falha ao recuperar pedidos com erro de navegador:", error);
    return;
  }

  console.log(
    "♻️ Pedidos com falha de navegador recuperados para PENDING:",
    recovered.map((row: any) => row.order_number || row.id)
  );
}

/**
 * =====================
 * FILA SAIBWEB
 * =====================
 */
function enqueue(orderId: string | null) {
  if (isShuttingDown) {
    console.log("🟡 Ignorando novo item: webhook em shutdown.");
    return { enqueued: false, shuttingDown: true };
  }

  const id = orderId ?? "__NO_ID__";

  if (queuedOrRunning.has(id)) {
    console.log("🟠 Gatilho duplicado ignorado:", id);
    return { enqueued: false };
  }

  queuedOrRunning.add(id);
  queue.push(id);

  console.log("📥 Enfileirado:", id, "| fila:", queue.length);
  return { enqueued: true };
}

function runOne(orderId: string) {
  return new Promise<{ ok: boolean; code: number | null }>((resolve) => {
    const { command, args, printable } = buildCommand();

    const realOrderId = orderId === "__NO_ID__" ? null : orderId;
    const childEnv = buildChildEnv(realOrderId);

    console.log("🚀 Iniciando automação SAIBWEB");
    console.log("🧾 order_id:", realOrderId ?? "(sem id)");
    console.log("▶️", printable);

    const child = spawn(command, args, {
      env: childEnv,
      cwd: PROJECT_ROOT,
      stdio: ["ignore", "inherit", "inherit"],
      shell: false,
    });
    activeChild = child;

    child.on("close", (code, signal) => {
      if (activeChild?.pid === child.pid) {
        activeChild = null;
      }
      if (signal) {
        console.error("⚠️ Runner encerrado por sinal:", signal);
      }
      resolve({ ok: code === 0, code: code ?? null });
    });

    child.on("error", (err) => {
      if (activeChild?.pid === child.pid) {
        activeChild = null;
      }
      console.error("❌ Falha ao iniciar automação:", err);
      resolve({ ok: false, code: null });
    });
  });
}

async function findPriorityAutoDrainOrderId(): Promise<string | null> {
  const priorityMinutes = Number.isFinite(AUTO_DRAIN_PRIORITY_WINDOW_MINUTES)
    ? Math.max(5, AUTO_DRAIN_PRIORITY_WINDOW_MINUTES)
    : 180;
  const cutoffIso = new Date(Date.now() - priorityMinutes * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("orders")
    .select("id, order_number")
    .in("saibweb_status", ["PENDING", "QUEUED"])
    .gte("created_at", cutoffIso)
    .is("cancelled_at", null)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    console.error("❌ Falha ao buscar pedido prioritário para auto-drain:", error);
    return null;
  }

  return data?.[0]?.id ? String(data[0].id) : null;
}

async function scheduleAutoDrain() {
  if (isShuttingDown) return;
  if (queue.length > 0 || isRunning) return;

  await recoverBrowserEnqueueFailures();

  const priorityOrderId = await findPriorityAutoDrainOrderId();
  const r = enqueue(priorityOrderId);
  if (!r.enqueued) return;

  void processQueue().catch((error) => {
    console.error("❌ processQueue falhou no auto-drain:", getErrorMessage(error));
  });
}

async function processQueue() {
  if (isRunning) return;
  isRunning = true;

  try {
    while (!isShuttingDown && queue.length > 0) {
      const next = queue.shift()!;
      lastRunAt = Date.now();

      console.log("➡️ Processando:", next, "| restante:", queue.length);
      try {
        const result = await runOne(next);

        if (result.ok) console.log("✅ Finalizado com sucesso.");
        else console.log("⚠️ Finalizado com erro.");
      } catch (error) {
        console.error("❌ Falha inesperada ao processar item da fila:", error);
      } finally {
        queuedOrRunning.delete(next);
      }
    }
  } finally {
    isRunning = false;
    console.log("🏁 Fila SAIBWEB vazia.");
  }
}

function waitForActiveChildExit(timeoutMs: number) {
  if (!activeChild) return Promise.resolve();

  const child = activeChild;

  return new Promise<void>((resolve) => {
    let finished = false;
    let killTimer: NodeJS.Timeout | null = null;

    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(termTimer);
      if (killTimer) clearTimeout(killTimer);
      resolve();
    };

    const termTimer = setTimeout(() => {
      console.warn(`🟡 Runner não encerrou em ${timeoutMs}ms; enviando SIGTERM...`);
      child.kill("SIGTERM");
      killTimer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          console.warn("🔴 Runner ainda ativo após SIGTERM; enviando SIGKILL...");
          child.kill("SIGKILL");
        }
      }, 5000);
      killTimer.unref();
    }, timeoutMs);

    child.once("close", finish);
    child.once("error", finish);
  });
}

/**
 * =====================
 * ROTAS
 * =====================
 */
app.get("/health", requireWebhookAuth, (_req, res) => {
  res.json({
    ok: true,
    saibweb: {
      running: isRunning,
      queued: queue.length,
      lastRunAt,
    },
    now: Date.now(),
  });
});

app.post("/webhook/new-order", requireWebhookAuth, (req, res) => {
  if (isShuttingDown) {
    return res.status(503).json({ ok: false, error: "Webhook shutting down" });
  }

  const orderId = extractOrderId(req.body);
  const r = enqueue(orderId);

  res.status(200).json({
    ok: true,
    order_id: orderId,
    enqueued: r.enqueued,
    queue_size: queue.length,
    running: isRunning,
  });

  void processQueue().catch((error) => {
    console.error("❌ processQueue falhou:", getErrorMessage(error));
  });
});

async function boot() {
  httpServer = app.listen(PORT, async () => {
    if (RECOVER_ON_BOOT) {
      await recoverStuckOrders().catch((err) => {
        console.error("❌ Erro ao executar recovery on boot:", err);
      });
    }

    console.log(`🧩 SAIBWEB webhook rodando em http://localhost:${PORT}`);
    console.log("🔓 Webhook auth: desabilitada");
    void scheduleAutoDrain();

    if (AUTO_DRAIN_INTERVAL_MS > 0) {
      autoDrainTimer = setInterval(() => {
        void scheduleAutoDrain();
      }, AUTO_DRAIN_INTERVAL_MS);
      autoDrainTimer.unref();
      console.log(`🔁 Auto-drain habilitado a cada ${AUTO_DRAIN_INTERVAL_MS}ms`);
    }
  });

  httpServer.on("error", (error) => {
    console.error("❌ Falha no servidor webhook:", error);
    process.exitCode = 1;
  });
}

async function shutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`🛑 Recebido ${signal}; encerrando webhook SAIBWEB...`);

  if (autoDrainTimer) {
    clearInterval(autoDrainTimer);
    autoDrainTimer = null;
  }

  if (!httpServer) {
    process.exit(0);
    return;
  }

  await new Promise<void>((resolve) => {
    httpServer?.close((error) => {
      if (error) {
        console.error("❌ Erro ao encerrar servidor webhook:", error);
        process.exitCode = 1;
      }
      resolve();
    });
  });

  if (activeChild) {
    console.log(`⏳ Aguardando runner ativo encerrar (pid ${activeChild.pid})...`);
    await waitForActiveChildExit(15000);
  }

  process.exit(process.exitCode ?? 0);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
process.on("unhandledRejection", (reason) => {
  console.error("❌ UnhandledPromiseRejection no webhook:", getErrorMessage(reason));
});
process.on("uncaughtException", (error) => {
  console.error("❌ UncaughtException no webhook:", error);
  process.exitCode = 1;
});

void boot();
