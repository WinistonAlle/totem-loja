// automation/cigam/match-product-codes.ts
//
// Casa products.cigam_code/cigam_unit do totem com os já cadastrados no
// catalogo-funcionarios, por nome normalizado (maiúsculo, sem acento, sem
// espaço duplicado). Não é 100% confiável — nomes podem divergir entre os
// dois catálogos mesmo sendo o mesmo produto físico.
//
// Uso (sempre roda em modo RELATÓRIO por padrão, não escreve nada):
//   npx tsx automation/cigam/match-product-codes.ts
//
// Para gravar de verdade os matches EXATOS (após revisar o relatório):
//   CIGAM_MATCH_EXEC=1 npx tsx automation/cigam/match-product-codes.ts
//
// Requer, além das vars normais do totem (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY):
//   CATALOGO_FUNCIONARIOS_SUPABASE_URL=https://apifuncionarios.gostinhomineiro.com
//   CATALOGO_FUNCIONARIOS_SERVICE_ROLE_KEY=<service role key do catalogo-funcionarios>
import dotenv from "dotenv";
dotenv.config();

import { createClient } from "@supabase/supabase-js";

function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type TotemProduct = { id: string; name: string; cigam_code: string | null };
type CatalogoProduct = { name: string; cigam_code: string; cigam_unit: string | null };

async function main() {
  const totemUrl = process.env.SUPABASE_URL;
  const totemKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const catalogoUrl = process.env.CATALOGO_FUNCIONARIOS_SUPABASE_URL;
  const catalogoKey = process.env.CATALOGO_FUNCIONARIOS_SERVICE_ROLE_KEY;

  if (!totemUrl || !totemKey) throw new Error("Faltam SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY do totem.");
  if (!catalogoUrl || !catalogoKey) {
    throw new Error(
      "Faltam CATALOGO_FUNCIONARIOS_SUPABASE_URL/CATALOGO_FUNCIONARIOS_SERVICE_ROLE_KEY " +
        "— ler em ~/apps/catalogo-funcionarios/.env no servidor (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY de lá)."
    );
  }

  const totem = createClient(totemUrl, totemKey, { auth: { persistSession: false } });
  const catalogo = createClient(catalogoUrl, catalogoKey, { auth: { persistSession: false } });

  const { data: totemProducts, error: totemErr } = await totem
    .from("products")
    .select("id, name, cigam_code")
    .is("cigam_code", null)
    .eq("active", true);
  if (totemErr) throw new Error(`Falha ao ler products do totem: ${totemErr.message}`);

  const { data: catalogoProducts, error: catalogoErr } = await catalogo
    .from("products")
    .select("name, cigam_code, cigam_unit")
    .not("cigam_code", "is", null);
  if (catalogoErr) throw new Error(`Falha ao ler products do catalogo-funcionarios: ${catalogoErr.message}`);

  const catalogoByName = new Map<string, CatalogoProduct>();
  for (const p of (catalogoProducts ?? []) as CatalogoProduct[]) {
    const key = normalizeName(p.name);
    // Em caso de nome duplicado no catalogo (raro), fica o primeiro — o
    // relatório abaixo não distingue isso, então revisar manualmente se
    // aparecer suspeito.
    if (!catalogoByName.has(key)) catalogoByName.set(key, p);
  }

  const matched: Array<{ id: string; name: string; cigam_code: string; cigam_unit: string | null }> = [];
  const unmatched: string[] = [];

  for (const p of (totemProducts ?? []) as TotemProduct[]) {
    const key = normalizeName(p.name);
    const found = catalogoByName.get(key);
    if (found) {
      matched.push({ id: p.id, name: p.name, cigam_code: found.cigam_code, cigam_unit: found.cigam_unit });
    } else {
      unmatched.push(p.name);
    }
  }

  console.log(`\n=== MATCHES ENCONTRADOS (${matched.length}) ===`);
  for (const m of matched) {
    console.log(`  ${m.name}  ->  cigam_code=${m.cigam_code}  cigam_unit=${m.cigam_unit ?? "(vazio)"}`);
  }

  console.log(`\n=== SEM MATCH — precisam de cadastro manual (${unmatched.length}) ===`);
  for (const name of unmatched) {
    console.log(`  ${name}`);
  }

  const exec = process.env.CIGAM_MATCH_EXEC === "1";
  if (!exec) {
    console.log("\n🧪 Modo RELATÓRIO — nada foi gravado. Revise a lista acima.");
    console.log("Para gravar os matches exatos: CIGAM_MATCH_EXEC=1 npx tsx automation/cigam/match-product-codes.ts");
    return;
  }

  console.log(`\n🚀 Gravando ${matched.length} matches no totem...`);
  let ok = 0;
  for (const m of matched) {
    const { error } = await totem
      .from("products")
      .update({ cigam_code: m.cigam_code, cigam_unit: m.cigam_unit })
      .eq("id", m.id);
    if (error) {
      console.error(`  ❌ ${m.name}: ${error.message}`);
    } else {
      ok++;
    }
  }
  console.log(`✅ ${ok}/${matched.length} produtos atualizados.`);
}

main().catch((err) => {
  console.error("❌ Falha no matching:", err?.message ?? err);
  process.exit(1);
});
