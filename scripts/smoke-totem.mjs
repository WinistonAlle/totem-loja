import { mkdir } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const outputDir = path.join(rootDir, "output", "playwright");
const scenario = process.env.SMOKE_TOTEM_SCENARIO?.trim() || "success";
const previewPort = Number(process.env.SMOKE_TOTEM_PORT || 4175);

const sampleProducts = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    old_id: 10034,
    name: "PAO DE QUEIJO GG 15G PCT 1KG",
    price: 18.4,
    employee_price: 18.4,
    price_cpf_varejo: 18.4,
    price_cpf_atacado: 17.2,
    price_cnpj_varejo: 18.4,
    price_cnpj_atacado: 17.2,
    category_id: 1,
    description: "Produto usado no smoke test",
    package_info: "Pacote 1kg",
    weight: 1,
    is_package: true,
    featured: false,
    in_stock: true,
    images: [],
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    old_id: 50659,
    name: "PAO DE QUEIJO PREMIUM 30G PCT 5KG",
    price: 114.95,
    employee_price: 114.95,
    price_cpf_varejo: 114.95,
    price_cpf_atacado: 109.95,
    price_cnpj_varejo: 114.95,
    price_cnpj_atacado: 109.95,
    category_id: 1,
    description: "Produto alternativo do smoke test",
    package_info: "Pacote 5kg",
    weight: 5,
    is_package: false,
    featured: false,
    in_stock: true,
    images: [],
  },
];

async function waitForServer(url, timeoutMs = 30000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.ok || response.status === 304) {
        return;
      }
    } catch {}

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timeout aguardando servidor do smoke em ${url}.`);
}

async function startPreviewServer() {
  const child = spawn(
    "npm",
    ["run", "preview", "--", "--host", "127.0.0.1", "--port", String(previewPort), "--strictPort"],
    {
      cwd: rootDir,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    }
  );

  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (chunk) => {
    stdout += String(chunk);
  });

  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });

  const baseUrl = `http://127.0.0.1:${previewPort}`;

  try {
    await waitForServer(baseUrl);
  } catch (error) {
    child.kill("SIGTERM");
    throw new Error(`Falha ao iniciar vite preview.\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
  }

  return { child, baseUrl };
}

async function installMockRoutes(page) {
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;

    if (pathname.includes("/rest/v1/products")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(sampleProducts),
      });
      return;
    }

    if (pathname.includes("/rest/v1/notices")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
      return;
    }

    if (pathname.includes("/rest/v1/rpc/create_order_v1")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            order_id: "33333333-3333-3333-3333-333333333333",
            order_number: "GM-SMOKE-0001",
            total_cents: 1840,
            pay_on_pickup_cents: 1840,
            status: "aguardando_atendimento",
          },
        ]),
      });
      return;
    }

    if (pathname.includes("/rest/v1/orders") || pathname.includes("/rest/v1/order_items")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
      return;
    }

    if (request.method() === "POST" && !url.origin.startsWith("http://127.0.0.1")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
      return;
    }

    await route.continue();
  });
}

async function run() {
  await mkdir(outputDir, { recursive: true });

  const externalBaseUrl = process.env.SMOKE_TOTEM_BASE_URL?.trim() || "";
  const localServer = externalBaseUrl ? null : await startPreviewServer();
  const baseUrl = externalBaseUrl || localServer.baseUrl;
  const browser = await chromium.launch({ headless: process.env.SMOKE_TOTEM_HEADFUL !== "1" });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];

  page.on("pageerror", (error) => {
    pageErrors.push(String(error));
  });

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });

  try {
    await installMockRoutes(page);
    if (scenario === "webhook_fail") {
      await page.addInitScript(() => {
        window.__GM_SMOKE_SAIBWEB_FAILURE__ = true;
      });
    }

    await page.goto(`${baseUrl}/contexto`, { waitUntil: "networkidle" });
    if (pageErrors.length) {
      throw new Error(`Page errors ao abrir /contexto: ${pageErrors.join(" | ")}`);
    }
    if (consoleErrors.length) {
      throw new Error(`Console errors ao abrir /contexto: ${consoleErrors.join(" | ")}`);
    }
    await page.getByTestId("context-channel-varejo").click();
    await page.getByTestId("totem-name-key-S").click();
    await page.getByTestId("totem-name-key-M").click();
    await page.getByTestId("totem-name-key-O").click();
    await page.getByTestId("totem-name-key-K").click();
    await page.getByTestId("totem-name-key-E").click();
    await page.getByTestId("totem-name-confirm").click();
    await page.getByTestId("catalog-search-input").waitFor({ state: "visible" });

    await page.getByTestId(`add-to-cart-${sampleProducts[0].id}`).click();
    await page.getByLabel("Abrir sua sacola").click();
    await page.getByTestId("cart-finalize").click();
    if (pageErrors.length) {
      throw new Error(`Page errors ao abrir checkout: ${pageErrors.join(" | ")}`);
    }
    if (consoleErrors.length) {
      throw new Error(`Console errors ao abrir checkout: ${consoleErrors.join(" | ")}`);
    }

    await page.getByTestId("checkout-customer-name").fill("Smoke Test");
    await page.getByTestId("checkout-confirm-order").click();

    await page.getByTestId("checkout-success-overlay").waitFor({ state: "visible" });
    if (scenario === "webhook_fail") {
      await page.getByText("Pedido salvo com pendência de integração").waitFor({ state: "visible" });
    }

    if (pageErrors.length) {
      throw new Error(`Page errors durante o smoke: ${pageErrors.join(" | ")}`);
    }

    if (consoleErrors.length) {
      throw new Error(`Console errors durante o smoke: ${consoleErrors.join(" | ")}`);
    }

    await page.screenshot({
      path: path.join(outputDir, `smoke-totem-${scenario}.png`),
      fullPage: true,
    });

    console.log(`Smoke test do totem passou (${scenario}).`);
  } catch (error) {
    await page.screenshot({
      path: path.join(outputDir, `smoke-totem-${scenario}-failure.png`),
      fullPage: true,
    }).catch(() => {});
    const diagnostics = [
      pageErrors.length ? `pageErrors=${pageErrors.join(" | ")}` : "",
      consoleErrors.length ? `consoleErrors=${consoleErrors.join(" | ")}` : "",
      `url=${page.url()}`,
    ]
      .filter(Boolean)
      .join("\n");

    if (diagnostics) {
      throw new Error(`${String(error)}\n${diagnostics}`);
    }

    throw error;
  } finally {
    await context.close();
    await browser.close();
    if (localServer?.child) {
      localServer.child.kill("SIGTERM");
    }
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
