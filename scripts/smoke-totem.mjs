import { mkdir } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const outputDir = path.join(rootDir, "output", "playwright");
const previewPort = Number(process.env.SMOKE_TOTEM_PORT || 4179);

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

  let saiuCedo = false;
  child.on("exit", () => {
    saiuCedo = true;
  });

  try {
    await waitForServer(baseUrl);
  } catch (error) {
    child.kill("SIGTERM");
    throw new Error(`Falha ao iniciar vite preview.\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
  }

  // Uma porta ocupada por OUTRO app responde 200 igual e o smoke seguiria
  // testando a aplicacao errada (foi o que aconteceu com a 4175, do equipgest).
  // Entao confirma que quem respondeu e o totem antes de continuar.
  const html = await fetch(baseUrl).then((r) => r.text());
  const nossoServidor = html.includes("GM - Catálogo Interativo");

  if (!nossoServidor || saiuCedo || /already in use/i.test(stderr)) {
    child.kill("SIGTERM");
    throw new Error(
      `A porta ${previewPort} nao esta servindo o totem: outra aplicacao respondeu.\n` +
        `Use SMOKE_TOTEM_PORT pra escolher uma porta livre.\nSTDERR:\n${stderr}`
    );
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

/**
 * O gmserver nao tem o chromium que o playwright baixa (e baixar so pra rodar
 * o smoke nao se paga), entao cai pro Chrome do sistema quando precisa.
 * SMOKE_TOTEM_CHROME force um binario especifico.
 */
async function launchBrowser() {
  const headless = process.env.SMOKE_TOTEM_HEADFUL !== "1";
  const escolhido = process.env.SMOKE_TOTEM_CHROME?.trim();

  if (escolhido) {
    return chromium.launch({ headless, executablePath: escolhido, args: ["--no-sandbox"] });
  }

  try {
    return await chromium.launch({ headless });
  } catch (error) {
    const candidatos = ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
    const doSistema = candidatos.find((caminho) => existsSync(caminho));
    if (!doSistema) throw error;

    console.warn(`[smoke] chromium do playwright indisponivel, usando ${doSistema}`);
    return chromium.launch({ headless, executablePath: doSistema, args: ["--no-sandbox"] });
  }
}

async function run() {
  await mkdir(outputDir, { recursive: true });

  const externalBaseUrl = process.env.SMOKE_TOTEM_BASE_URL?.trim() || "";
  const localServer = externalBaseUrl ? null : await startPreviewServer();
  const baseUrl = externalBaseUrl || localServer.baseUrl;
  const browser = await launchBrowser();
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

    // Fluxo atual: /inicio -> catalogo, e o nome do cliente vem de um modal
    // dentro do proprio catalogo. A tela /contexto (e a escolha manual de
    // varejo/atacado) saiu em 04/09, quando o canal passou a ser por item.
    await page.goto(`${baseUrl}/inicio`, { waitUntil: "domcontentloaded" });
    // O botao tem animacao continua, entao nunca fica "stable" pro playwright.
    await page.getByRole("button", { name: /come/i }).click({ force: true });

    if (pageErrors.length) {
      throw new Error(`Page errors ao abrir o catalogo: ${pageErrors.join(" | ")}`);
    }
    if (consoleErrors.length) {
      throw new Error(`Console errors ao abrir o catalogo: ${consoleErrors.join(" | ")}`);
    }

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

    if (pageErrors.length) {
      throw new Error(`Page errors durante o smoke: ${pageErrors.join(" | ")}`);
    }

    if (consoleErrors.length) {
      throw new Error(`Console errors durante o smoke: ${consoleErrors.join(" | ")}`);
    }

    await page.screenshot({
      path: path.join(outputDir, "smoke-totem.png"),
      fullPage: true,
    });

    console.log("Smoke test do totem passou.");
  } catch (error) {
    await page.screenshot({
      path: path.join(outputDir, "smoke-totem-failure.png"),
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
