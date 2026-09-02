/**
 * Preflight do go-live da sincronizacao CIGAM. NAO fala com o CIGAM — le so o
 * Supabase, entao pode rodar a qualquer hora, com a loja aberta, sem risco de
 * derrubar a sessao unica do usuario `winiston.a` que o PDV usa em producao.
 *
 * Responde: tem pedido esperando sync? tem produto vendavel que derrubaria o
 * pedido inteiro em buildItens por falta de cigam_code?
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const env = Object.fromEntries(
  readFileSync(join(root, ".env"), "utf8")
    .split("\n")
    .filter((l) => l.trim() && !l.trimStart().startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);

const headers = {
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
};

async function q(path) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { headers });
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}

const orders = await q(
  "orders?select=order_number,created_at,status,erp_status,erp_external_id,erp_error&order=created_at.desc&limit=500"
);

const porStatus = {};
for (const o of orders) {
  const k = o.erp_status ?? "(null)";
  porStatus[k] = (porStatus[k] ?? 0) + 1;
}

console.log(`PEDIDOS: ${orders.length} na tabela (ultimos 500)`);
console.log("  por erp_status:", Object.keys(porStatus).length ? porStatus : "(tabela vazia)");

const naFila = orders.filter((o) => o.erp_status === "PENDING" || o.erp_status === "ERROR" || o.erp_status == null);
if (naFila.length) {
  console.log(`\n  ${naFila.length} pedido(s) que o servico processaria assim que subir:`);
  for (const o of naFila) {
    console.log(
      `   ${o.created_at?.slice(0, 16)}  ${o.order_number}  status=${o.status}  erp=${o.erp_status}` +
        (o.erp_error ? `\n      erro: ${String(o.erp_error).slice(0, 140)}` : "")
    );
  }
}

const produtos = await q("products?select=id,name,cigam_code,cigam_unit,active,in_stock&order=name");
const semCodigo = produtos.filter((p) => !p.cigam_code);
const vendaveis = semCodigo.filter((p) => p.active && p.in_stock);

console.log(
  `\nPRODUTOS: ${produtos.length} total, ${produtos.length - semCodigo.length} com cigam_code, ${semCodigo.length} sem`
);
if (semCodigo.length) {
  console.log("\n  Sem cigam_code:");
  for (const p of semCodigo) {
    const vend = p.active && p.in_stock;
    console.log(`   ${vend ? "VENDAVEL" : "  --    "}  active=${p.active} in_stock=${p.in_stock}  ${p.name}`);
  }
}

console.log("\n---");
if (vendaveis.length) {
  console.log(
    `BLOQUEIA: ${vendaveis.length} produto(s) vendavel(is) sem cigam_code. Um carrinho que\n` +
      "inclua qualquer um deles falha em buildItens e derruba o PEDIDO INTEIRO\n" +
      "(erp_status=ERROR, antes de qualquer chamada ao CIGAM)."
  );
} else {
  console.log("OK: nenhum produto vendavel sem cigam_code.");
}
console.log(
  naFila.length
    ? `ATENCAO: ${naFila.length} pedido(s) seriam sincronizados — e com CIGAM_AUTO_EFETIVAR_PEDIDO=${env.CIGAM_AUTO_EFETIVAR_PEDIDO}, NF real emitida — assim que totem-loja-cigam subir.`
    : "OK: fila vazia, subir o servico nao emite NF nenhuma de imediato."
);
