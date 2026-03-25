import http from "node:http";
import { mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const outputDir = path.join(rootDir, "output", "playwright");
const scenario = process.env.SMOKE_TOTEM_SCENARIO?.trim() || "success";

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".woff2": "font/woff2",
};

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

function getMimeType(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

async function resolveStaticFile(urlPathname) {
  const cleanPath = decodeURIComponent(urlPathname.split("?")[0]);
  const relative = cleanPath === "/" ? "/index.html" : cleanPath;
  const targetPath = path.normalize(path.join(distDir, relative));

  if (!targetPath.startsWith(distDir)) {
    return path.join(distDir, "index.html");
  }

  try {
    const info = await stat(targetPath);
    if (info.isDirectory()) {
      return path.join(targetPath, "index.html");
    }
    return targetPath;
  } catch {
    return path.join(distDir, "index.html");
  }
}

async function startStaticServer() {
  const server = http.createServer(async (req, res) => {
    try {
      const filePath = await resolveStaticFile(req.url || "/");
      const content = await readFile(filePath);
      res.writeHead(200, { "content-type": getMimeType(filePath) });
      res.end(content);
    } catch (error) {
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      res.end(String(error));
    }
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Não foi possível iniciar o servidor do smoke test.");
  }

  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
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
      if (scenario === "webhook_fail") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "saibweb indisponivel" }),
        });
        return;
      }

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
  const localServer = externalBaseUrl ? null : await startStaticServer();
  const baseUrl = externalBaseUrl || localServer.baseUrl;
  const browser = await chromium.launch({ headless: process.env.SMOKE_TOTEM_HEADFUL !== "1" });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });

  try {
    await installMockRoutes(page);

    await page.goto(`${baseUrl}/inicio`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Começar" }).click();

    await page.getByRole("button", { name: "VAREJO" }).click();
    await page.getByPlaceholder("Buscar produto (nome ou código)...").waitFor({ state: "visible" });

    await page.getByRole("button", { name: "Adicionar" }).first().click();
    await page.getByLabel("Abrir sua sacola").click();
    await page.getByRole("button", { name: "Finalizar" }).click();

    await page.locator("#customer-name").fill("Smoke Test");
    await page.getByRole("button", { name: "Confirmar pedido" }).click();

    await page.getByText("Pedido enviado!").waitFor({ state: "visible" });
    if (scenario === "webhook_fail") {
      await page.getByText("Pedido salvo com pendência de integração").waitFor({ state: "visible" });
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
    throw error;
  } finally {
    await browser.close();
    if (localServer?.server) {
      await new Promise((resolve, reject) =>
        localServer.server.close((err) => (err ? reject(err) : resolve()))
      );
    }
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
