/**
 * Serviço de sincronização CIGAM — roda em loop, chamando
 * processPendingOrders a cada CIGAM_SYNC_INTERVAL_MS. Pensado para rodar
 * como processo pm2 de longa duração (totem-loja-cigam), não como script
 * único disparado por cron.
 */
import dotenv from "dotenv";
dotenv.config();

import { createClient } from "@supabase/supabase-js";
import { processPendingOrders } from "./cigam/process-pending-orders";

const INTERVAL_MS = Number(process.env.CIGAM_SYNC_INTERVAL_MS ?? 60_000);

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

let isRunning = false;

async function tick() {
  if (isRunning) return;
  isRunning = true;
  try {
    const results = await processPendingOrders({ supabase, dryRun: false, limit: 10 });
    for (const r of results) {
      const tag = `${r.orderNumber} → ${r.status}${r.cigamCode ? ` (CIGAM ${r.cigamCode})` : ""}`;
      if (r.status === "ERROR") console.error("❌ [cigam-sync]", tag, r.error ?? "");
      else console.log("✅ [cigam-sync]", tag, r.notaFiscal ? `CF1 ${r.notaFiscal}` : "");
    }
  } catch (err: any) {
    console.error("❌ [cigam-sync] Falha no ciclo de sincronização:", err?.message ?? err);
  } finally {
    isRunning = false;
  }
}

console.log(`🧩 CIGAM sync rodando — intervalo de ${INTERVAL_MS}ms`);
void tick();
setInterval(() => {
  void tick();
}, INTERVAL_MS);

process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));
