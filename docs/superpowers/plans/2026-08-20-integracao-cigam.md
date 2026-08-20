# Integração CIGAM no Totem — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir a integração SAIBWEB do totem (`totem-loja`, catálogo de autoatendimento da loja Gostinho Mineiro) por lançamento direto de pedidos no ERP CIGAM, seguindo o mesmo padrão já validado em produção nos projetos irmãos `pdv-gostinho-mineiro` (cliente REST via portal) e `catalogo-funcionarios` (fluxo assíncrono "pedido pendente → processo separado lança no CIGAM").

**Architecture:** O checkout do totem continua gravando o pedido no Supabase exatamente como hoje (RPC `create_order_v1` ou fallback client-side), só que sem mais chamar o webhook SAIBWEB — o pedido nasce com `erp_status = 'PENDING'`. Um processo Node novo e separado (`automation/cigam/client.ts` + `automation/cigam/process-pending-orders.ts`, rodando como serviço pm2, não pelo navegador do cliente) varre pedidos `PENDING`, autentica no portal do representante CIGAM, cria o pedido (cabeçalho → itens → cálculo de imposto → libera para faturamento → efetiva/emite CF1), e grava de volta `erp_status`/`erp_external_id`/`erp_nota_fiscal`. O SAIBWEB (Playwright) é desligado.

**Tech Stack:** Node 20 + TypeScript (`tsx`), Supabase JS (`@supabase/supabase-js`), fetch nativo pro CIGAM REST, pm2 para o processo de sincronização, Supabase Cloud (projeto `jsltcdtwdeemwchfyylk`) para o banco do totem.

---

## ⚠️ Decisões de negócio ainda em aberto — CONFIRMAR COM O DONO ANTES DA TASK 7

**✅ TODAS AS DECISÕES ABAIXO FORAM CONFIRMADAS PELO DONO EM 2026-08-20.** Não há mais bloqueio para a Task 7 em diante.

1. **`CIGAM_UNIDADE_NEGOCIO=100`** — confirmado. Totem é venda direta ao consumidor, mesma empresa Ímpar do PDV varejo.
2. **`CIGAM_CONDICAO_PAGAMENTO=500`** — confirmado. Mesmo código de dinheiro/à vista do PDV (`CIGAM_CONDICAO_PAGAMENTO_DINHEIRO=500`), já que o pagamento real acontece na retirada, com o atendente, fora do totem.
3. **`CIGAM_TABELA_PRECO_VAREJO=002`** / **`CIGAM_TABELA_PRECO_ATACADO=003`** — confirmado. São as mesmas tabelas "Varejo"/"Atacado" do PDV (`src/pages/Carrinho.tsx` do pdv-gm, `PRICE_TABLES`), reaproveitadas diretamente. O totem já decide sozinho o canal pela regra de quantidade (20 pacotes para salgados festa frito/assado, 10kg para os demais itens) — quando o pedido é atacado, usa `003`; quando é varejo, usa `002`.
4. **Cliente CIGAM para pedidos de atacado** — confirmado: **também usa o Consumidor genérico** (`CIGAM_CLIENTE_CONSUMIDOR`, mesmo código do PDV), igual ao varejo. Não há distinção de cliente PJ por CNPJ neste fluxo — mais simples e não depende de cadastro de CNPJ no CIGAM.

---

## Task 1: Migration Supabase — colunas CIGAM em `products` e `orders`

**Contexto:** o totem usa **Supabase Cloud** (`https://jsltcdtwdeemwchfyylk.supabase.co`), diferente da instância self-hosted do catálogo de funcionários (`apifuncionarios.gostinhomineiro.com`). Não há acesso Postgres direto (`docker exec ... psql`) como nos projetos self-hosted — **a migration precisa ser colada manualmente no SQL Editor do Supabase Studio** (dashboard do projeto `jsltcdtwdeemwchfyylk`), do mesmo jeito que o PDV documenta para as suas próprias migrations. Rodar migration sozinha *não acontece* — confirmar depois, por query, que as colunas existem antes de seguir para a Task 2.

**Files:**
- Create: `~/apps/totem-loja/supabase/migrations/2026-08-20-cigam-integration.sql` (arquivo de referência no repo, mesmo que a aplicação real seja manual via Studio)
- Modify: `~/apps/totem-loja/supabase-local-complete.sql` (linha 108, tabela `products`; linha 156, tabela `orders`; linha 385, função `create_order_v1`) — manter esse arquivo como "fonte de verdade" do schema atualizado, igual já é hoje.

- [ ] **Step 1: Escrever o SQL da migration**

```sql
-- ~/apps/totem-loja/supabase/migrations/2026-08-20-cigam-integration.sql
-- Rodar manualmente no SQL Editor do Supabase Studio do projeto jsltcdtwdeemwchfyylk.
-- Aditivo e idempotente — não altera nenhum dado existente.

-- 1) Mapeamento produto -> material CIGAM
alter table public.products
  add column if not exists cigam_code text,
  add column if not exists cigam_unit text;

comment on column public.products.cigam_code is
  'Código do material no CIGAM (suprimentos/es/Materiais). NULL = produto ainda não mapeado, não pode ir pro CIGAM.';
comment on column public.products.cigam_unit is
  'Unidade de medida do material no CIGAM (KG, PCT, CX, UN...). Controla como quantidade/preço são convertidos ao montar o pedido (KG multiplica pelo peso do pacote).';

create index if not exists products_cigam_code_idx
  on public.products (cigam_code)
  where cigam_code is not null;

-- 2) Status de sincronização do pedido com o CIGAM (mesmo padrão do catalogo-funcionarios)
alter table public.orders
  add column if not exists erp_status text,
  add column if not exists erp_external_id text,
  add column if not exists erp_error text,
  add column if not exists erp_nota_fiscal text,
  add column if not exists erp_synced_at timestamptz;

comment on column public.orders.erp_status is
  'PENDING = aguardando lançamento no CIGAM. DONE = lançado (e efetivado, se CIGAM_AUTO_EFETIVAR_PEDIDO=1). ERROR = falhou, ver erp_error. NULL = pedido anterior à integração CIGAM.';
comment on column public.orders.erp_external_id is
  'Número do pedido gerado pelo CIGAM (Pedido/Salvar).';
comment on column public.orders.erp_nota_fiscal is
  'Número do documento fiscal (série CF1) emitido na efetivação, quando houve.';

create index if not exists orders_erp_status_idx on public.orders (erp_status);
```

- [ ] **Step 2: Colar e rodar no SQL Editor do Supabase Studio (projeto `jsltcdtwdeemwchfyylk`)**

Sem CLI/docker aqui — é manual, via dashboard. Depois de rodar, confirmar com uma leitura simples (pode ser via `psql`/REST a partir do Mac ou de onde tiver a `SUPABASE_SERVICE_ROLE_KEY`, é só leitura):

```bash
curl -s "https://jsltcdtwdeemwchfyylk.supabase.co/rest/v1/products?select=cigam_code,cigam_unit&limit=1" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

Expected: `[{"cigam_code":null,"cigam_unit":null}]` (ou lista vazia `[]` se a tabela não tiver linhas ainda, mas sem erro de coluna inexistente).

- [ ] **Step 3: Atualizar `create_order_v1` para gravar `erp_status = 'PENDING'` no insert**

A função hoje só seta `saibweb_status = 'PENDING'`. Precisa setar `erp_status` também, senão o processo de sync nunca vê o pedido novo. Substituir o bloco `insert into public.orders (...)` dentro de `create_order_v1` (arquivo `supabase-local-complete.sql`, e colar o `CREATE OR REPLACE FUNCTION` completo no SQL Editor):

```sql
create or replace function public.create_order_v1(
  p_customer_id uuid default null,
  p_customer_document text default null,
  p_customer_name text default null,
  p_payment_method text default 'attendant',
  p_pay_on_pickup_cents integer default null,
  p_items jsonb default '[]'::jsonb
)
returns table (
  order_id uuid,
  order_number text,
  total_cents integer,
  pay_on_pickup_cents integer,
  status text
)
language plpgsql
as $$
declare
  v_order_id uuid;
  v_payment_method text := coalesce(nullif(btrim(p_payment_method), ''), 'attendant');
  v_channel text := case when lower(coalesce(p_payment_method, '')) like '%atacado%' then 'atacado' else 'varejo' end;
  v_items_count integer := 0;
  v_inserted_count integer := 0;
  v_total_cents integer := 0;
  v_pay_on_pickup integer := 0;
begin
  if p_customer_document is null or btrim(p_customer_document) = '' then
    raise exception 'customerDocument vazio.';
  end if;

  if p_customer_name is null or btrim(p_customer_name) = '' then
    raise exception 'customerName vazio.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Pedido sem itens.';
  end if;

  v_items_count := jsonb_array_length(p_items);
  if v_items_count = 0 then
    raise exception 'Pedido sem itens.';
  end if;

  insert into public.orders (
    customer_id,
    customer_document,
    customer_name,
    payment_method,
    wallet_debited,
    spent_from_balance_cents,
    status,
    saibweb_status,
    saibweb_error,
    erp_status,
    erp_error
  )
  values (
    p_customer_id,
    btrim(p_customer_document),
    btrim(p_customer_name),
    v_payment_method,
    false,
    0,
    'aguardando_atendimento',
    null,
    null,
    'PENDING',
    null
  )
  returning id into v_order_id;

  insert into public.order_items (
    order_id,
    product_id,
    product_old_id,
    product_name,
    quantity,
    unit_price_cents
  )
  select
    v_order_id,
    p.id,
    nullif(p.old_id::text, ''),
    coalesce(nullif(p.name, ''), 'Produto'),
    floor(i.quantity)::integer,
    case
      when v_channel = 'atacado' and coalesce(p.price_cnpj_atacado, 0) > 0 then round(p.price_cnpj_atacado * 100)::integer
      when v_channel = 'varejo' and coalesce(p.price_cpf_varejo, 0) > 0 then round(p.price_cpf_varejo * 100)::integer
      when coalesce(p.price, 0) > 0 then round(p.price * 100)::integer
      when coalesce(p.employee_price, 0) > 0 then round(p.employee_price * 100)::integer
      else 0
    end
  from jsonb_to_recordset(p_items) as i(product_id uuid, quantity numeric)
  join public.products p on p.id = i.product_id
  where i.quantity is not null
    and floor(i.quantity) > 0;

  get diagnostics v_inserted_count = row_count;

  if v_inserted_count <> v_items_count then
    raise exception 'Produto inválido ou desatualizado no carrinho.';
  end if;

  perform public.refresh_order_totals(v_order_id);

  select o.total_cents
    into v_total_cents
  from public.orders o
  where o.id = v_order_id;

  if v_total_cents <= 0 then
    raise exception 'Pedido sem valor válido.';
  end if;

  if lower(v_payment_method) like 'attendant%' and p_pay_on_pickup_cents is not null and p_pay_on_pickup_cents <> v_total_cents then
    raise exception 'Os preços do carrinho foram atualizados. Revise os itens antes de confirmar.';
  end if;

  v_pay_on_pickup := coalesce(
    p_pay_on_pickup_cents,
    case when lower(v_payment_method) like 'attendant%' then v_total_cents else 0 end
  );

  update public.orders
     set pay_on_pickup_cents = greatest(v_pay_on_pickup, 0),
         wallet_used_cents = 0,
         spent_from_balance_cents = 0,
         updated_at = timezone('utc', now())
   where id = v_order_id;

  return query
  select
    o.id,
    o.order_number,
    o.total_cents,
    o.pay_on_pickup_cents,
    o.status
  from public.orders o
  where o.id = v_order_id;
end;
$$;
```

(Única mudança real: `saibweb_status`/`saibweb_error` viram `null`/`null` no insert — as colunas continuam existindo, só paramos de escrever nelas — e `erp_status`/`erp_error` entram como `'PENDING'`/`null`.)

- [ ] **Step 4: Atualizar as duas cópias do arquivo de schema no repo**

Editar `~/apps/totem-loja/supabase-local-complete.sql`: aplicar o mesmo diff de `products`/`orders`/`create_order_v1` acima (colunas novas + função substituída), para o arquivo continuar batendo com o banco real.

- [ ] **Step 5: Commit**

```bash
cd ~/apps/totem-loja
git add supabase/migrations/2026-08-20-cigam-integration.sql supabase-local-complete.sql
git commit -m "db: colunas cigam_code/cigam_unit em products e erp_* em orders"
```

---

## Task 2: Script de mapeamento `cigam_code`/`cigam_unit` a partir do catálogo de funcionários

**Contexto:** o catálogo de funcionários já tem ~170 produtos mapeados pra código CIGAM (`products.cigam_code`/`cigam_unit`, self-hosted em `apifuncionarios.gostinhomineiro.com`). O totem é uma base **separada** (Supabase Cloud), sem `id` em comum — o único jeito de casar é por **nome normalizado**. Isso é impreciso (nomes podem divergir levemente entre os dois catálogos), então o script é **read-only por padrão**: gera um relatório, nunca escreve sem uma segunda confirmação explícita.

**Files:**
- Create: `~/apps/totem-loja/automation/cigam/match-product-codes.ts`

- [ ] **Step 1: Escrever o script de matching**

```typescript
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
```

- [ ] **Step 2: Rodar em modo relatório (sem gravar nada) no servidor**

```bash
ssh xulio@192.168.100.128 '
  cd ~/apps/totem-loja &&
  CATALOGO_FUNCIONARIOS_SUPABASE_URL=$(grep -m1 "^SUPABASE_URL=" ~/apps/catalogo-funcionarios/.env | cut -d= -f2-) \
  CATALOGO_FUNCIONARIOS_SERVICE_ROLE_KEY=$(grep -m1 "^SUPABASE_SERVICE_ROLE_KEY=" ~/apps/catalogo-funcionarios/.env | cut -d= -f2-) \
  npx tsx automation/cigam/match-product-codes.ts
'
```

Expected: duas listas impressas (matches e sem-match), nada gravado. **Revisar a lista de matches com o dono antes do Step 3** — nome igual não é garantia de ser o mesmo produto físico (ex.: pacotes de tamanhos diferentes com nome parecido).

- [ ] **Step 3: Depois de revisado, gravar os matches confirmados**

Mesmo comando do Step 2, mas com `CIGAM_MATCH_EXEC=1` antes do `npx tsx`. Produtos sem match ficam para cadastro manual no Admin (Task 3 do gap "cadastro manual" — fora deste plano, é edição de dado, não de código; adicionar o campo no Admin fica coberto na Task 5 abaixo).

- [ ] **Step 4: Commit**

```bash
cd ~/apps/totem-loja
git add automation/cigam/match-product-codes.ts
git commit -m "feat: script de matching cigam_code/cigam_unit a partir do catalogo-funcionarios"
```

---

## Task 3: Cliente CIGAM (`automation/cigam/client.ts`)

**Contexto:** adaptado do cliente de referência em `catalogo-funcionarios/automation/cigam/client.ts` (autenticação via portal do representante — a REST nativa `Login/Autenticar` não funciona para escrita, ver `[[reference_cigam_api]]`). Trimado: sem os métodos de estoque/preço-tabela/materiais que o catálogo de funcionários usa para sincronizar estoque — o totem, nesta fase, não sincroniza estoque do CIGAM (fora de escopo deste plano; se quiser depois, dá pra portar `buscarDisponibilidades`/`buscarTodosMateriais` do arquivo de referência).

**Files:**
- Create: `~/apps/totem-loja/automation/cigam/client.ts`

- [ ] **Step 1: Escrever o cliente**

```typescript
/**
 * Cliente CIGAM — criação de pedido pela API REST (Portais Web API).
 *
 * Adaptado de catalogo-funcionarios/automation/cigam/client.ts (mesma
 * empresa, mesmo CIGAM). Diferenças do totem:
 *   - Cliente fixo "Consumidor genérico" (CIGAM_CODIGO_CLIENTE, mesmo
 *     código do PDV — CIGAM_CLIENTE_CONSUMIDOR lá), não um cliente
 *     exclusivo por canal.
 *   - Série de nota CF1 (cupom fiscal real, transmite à SEFAZ) em vez de
 *     REC (recibo) — a efetivação aqui tem consequência fiscal real.
 *   - Sem os métodos de consulta de estoque/materiais/tabela de preço —
 *     não fazem parte do escopo desta integração.
 *
 * Fluxo do pedido (igual ao de referência):
 *   1. autenticar()                      -> CGPortal_Token (Bearer de tudo)
 *   2. POST comercial/fa/Pedido/Salvar   -> cabeçalho; o CIGAM gera o número
 *   3. POST .../Pedido/SalvarItemPedido  -> um por item
 *   4. POST .../Pedido/CalcularImposto   -> sem isto, Tipo Operação/CFOP e os
 *                                           totais do pedido ficam zerados
 *   5. PUT .../Pedido/AtualizarControlePedido -> libera p/ faturamento (best-effort)
 *   6. POST .../Pedido/Efetivar          -> emite CF1 (NF-e real via SEFAZ)
 */

export type CigamPedido = {
  /** Nosso código/ref (vai na observação). O CIGAM gera o número real do pedido. */
  codigo: string;
  observacao: string;
  /** yyyy-MM-dd. Default: hoje. */
  dataPedido?: string;
  codigoCondicaoPagamento?: string;
  tabelaPreco?: string;
  tipoNota?: string;
};

export type CigamItemPedido = {
  codigoMaterial: string;
  quantidade: number;
  precoUnitario: number;
  /** KG, PCT, CX, UN... (products.cigam_unit). Não é enviado ao CIGAM — a
   * API REST deriva a unidade do próprio cadastro do material. Usado só por
   * quem monta o item (process-pending-orders) para converter quantidade e
   * preço antes de chegar aqui. */
  unidadeMedida: string;
  codigoCentroArmazenagem?: string;
};

export class CigamError extends Error {
  /** Marca sessão derrubada por outro login (HTTP 500 + "Usuário não
   * autenticado" no corpo, NÃO 401) — só este caso é elegível a relogin+retry. */
  sessaoExpirada = false;

  constructor(
    message: string,
    public readonly status: number | null = null
  ) {
    super(message);
    this.name = "CigamError";
  }
}

type HttpCustomResponse<T = unknown> = {
  success: boolean;
  messages?: string[];
  data?: T;
  hash?: string;
};

export type EfetivarResultado = {
  success: boolean;
  codigoNotaFiscal?: string;
  erro?: string;
};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new CigamError(`Variável de ambiente ${name} não configurada.`);
  return value;
}

function extractHidden(html: string, name: string): string {
  const escaped = name.replace(/[.[\]]/g, "\\$&");
  const m = html.match(new RegExp(`name="${escaped}"[^>]+value="([^"]*)"`, "i"));
  return m?.[1] ?? "";
}

/** Data local em yyyy-MM-dd. Deliberadamente NÃO usa toISOString(): em
 * America/Sao_Paulo (UTC-3) vira o dia seguinte a partir das 21h. */
function hojeLocal(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

const TIMEOUT_PADRAO_MS = 30_000;
/** Efetivar conversa com a SEFAZ — rotineiramente passa de 30s. */
const TIMEOUT_EFETIVAR_MS = 60_000;

export class CigamClient {
  private cookieHeader: string | null = null;
  private token: string | null = null;
  private reloginPromise: Promise<void> | null = null;

  private readonly cfg = {
    baseUrl:
      process.env.CIGAM_BASE_URL ??
      (process.env.CIGAM_API_URL ?? "").replace(/\/api\/api\/?$/, "").replace(/\/+$/, ""),
    apiUrl: (
      process.env.CIGAM_API_URL ??
      `${(process.env.CIGAM_BASE_URL ?? "").replace(/\/+$/, "")}/api/api`
    ).replace(/\/+$/, ""),
    portalPath: process.env.CIGAM_PORTAL_PATH ?? "/portalrepresentante",
    user: () => requiredEnv("CIGAM_API_USER"),
    pass: () => requiredEnv("CIGAM_API_PASS"),
    // Consumidor genérico — mesmo código usado pelo PDV (CIGAM_CLIENTE_CONSUMIDOR lá).
    codigoCliente: process.env.CIGAM_CODIGO_CLIENTE ?? "5",
    tabelaPreco: process.env.CIGAM_TABELA_PRECO ?? "",
    condicaoPagamento: process.env.CIGAM_CONDICAO_PAGAMENTO ?? "",
    tipoNota: process.env.CIGAM_TIPO_NOTA ?? "N",
    centroArmazenagem: process.env.CIGAM_CENTRO_ARMAZENAGEM ?? "001",
    unidadeNegocio: process.env.CIGAM_UNIDADE_NEGOCIO ?? "100",
    controle: process.env.CIGAM_CONTROLE ?? "20",
    /** CF1 — cupom fiscal real, transmite à SEFAZ (diferente do REC do
     * catálogo de funcionários). */
    serieNota: process.env.CIGAM_NOTA_SERIE ?? "CF1",
  };

  private get portalUrl(): string {
    return `${this.cfg.baseUrl}${this.cfg.portalPath}`;
  }

  private static mergeSetCookies(existing: string, res: Response): string {
    const map = new Map<string, string>();
    for (const part of existing ? existing.split("; ") : []) {
      const eq = part.indexOf("=");
      if (eq > 0) map.set(part.slice(0, eq), part.slice(eq + 1));
    }
    const setCookies =
      typeof (res.headers as any).getSetCookie === "function"
        ? (res.headers as any).getSetCookie()
        : res.headers.get("set-cookie")
        ? [res.headers.get("set-cookie") as string]
        : [];
    for (const sc of setCookies as string[]) {
      const nameVal = (sc.split(";")[0] ?? "").trim();
      const eq = nameVal.indexOf("=");
      if (eq > 0) map.set(nameVal.slice(0, eq), nameVal.slice(eq + 1));
    }
    return Array.from(map, ([k, v]) => `${k}=${v}`).join("; ");
  }

  /** Login no portal do representante (form POST) só para obter o
   * CGPortal_Token — ver cabeçalho do arquivo para o porquê. */
  async autenticar(): Promise<void> {
    const loginUrl = `${this.portalUrl}/`;

    const pageRes = await fetch(loginUrl, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "text/html" },
    });
    let cookies = CigamClient.mergeSetCookies("", pageRes);
    const loginHtml = await pageRes.text();
    const csrf = extractHidden(loginHtml, "__RequestVerificationToken");
    if (!csrf) throw new CigamError("CSRF não encontrado na página de login do portal.");

    const form = new URLSearchParams({
      __RequestVerificationToken: csrf,
      Usuario: this.cfg.user(),
      Senha: this.cfg.pass(),
      ContinuarConectado: "true",
      ContinuarConectadoHidden: "false",
      ReturnUrl: `${this.cfg.portalPath}/ge/pessoa`,
    });
    const loginRes = await fetch(loginUrl, {
      method: "POST",
      redirect: "manual",
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: cookies,
        Referer: loginUrl,
      },
      body: form.toString(),
    });
    cookies = CigamClient.mergeSetCookies(cookies, loginRes);

    const token = /CGPortal_Token=([^;]+)/.exec(cookies)?.[1];
    if (!token) {
      throw new CigamError(
        "Login no portal falhou (CGPortal_Token não retornado). Confira usuário/senha.",
        loginRes.status
      );
    }
    this.cookieHeader = cookies;
    this.token = token;
  }

  private async ensureAuth(): Promise<string> {
    if (!this.token) await this.autenticar();
    return this.token!;
  }

  async verificarSessao(): Promise<boolean> {
    try {
      await this.ensureAuth();
      return true;
    } catch {
      return false;
    }
  }

  /** O CIGAM só admite UMA sessão ativa por usuário: outro login (o PDV usa
   * outra credencial, então isso normalmente não colide entre projetos, mas
   * colide se dois processos do totem rodarem com a mesma credencial ao
   * mesmo tempo) invalida a sessão em voo, e a próxima chamada falha com
   * HTTP 500 + "Usuário não autenticado" — NÃO 401. */
  private async withAuthRetry<T>(request: () => Promise<T>): Promise<T> {
    await this.ensureAuth();
    try {
      return await request();
    } catch (err) {
      if (!(err instanceof CigamError) || !err.sessaoExpirada) throw err;
      if (!this.reloginPromise) {
        this.reloginPromise = this.autenticar().finally(() => {
          this.reloginPromise = null;
        });
      }
      await this.reloginPromise;
      return await request();
    }
  }

  private async apiFetch<T>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    options: { body?: unknown; query?: Record<string, string>; timeoutMs?: number } = {}
  ): Promise<HttpCustomResponse<T>> {
    const url = new URL(`${this.cfg.apiUrl}${path}`);
    for (const [k, v] of Object.entries(options.query ?? {})) url.searchParams.set(k, v);

    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/json",
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_PADRAO_MS),
    });

    const texto = await res.text();
    let payload: any = null;
    try {
      payload = texto ? JSON.parse(texto) : null;
    } catch {
      throw new CigamError(
        `Resposta inesperada do CIGAM em ${path} (HTTP ${res.status}): ${texto.slice(0, 200)}`,
        res.status
      );
    }

    const mensagens: string[] = payload?.messages ?? [];
    if (mensagens.some((m) => /n[ãa]o autenticado/i.test(m))) {
      const erro = new CigamError("Sessão CIGAM expirada (usuário não autenticado).", res.status);
      erro.sessaoExpirada = true;
      throw erro;
    }

    if (!res.ok && payload?.success === undefined) {
      throw new CigamError(
        mensagens.join("; ") || `Falha na chamada ${path} (HTTP ${res.status}).`,
        res.status
      );
    }

    return payload as HttpCustomResponse<T>;
  }

  private async criarCabecalho(pedido: CigamPedido): Promise<string> {
    const data = await this.withAuthRetry(() =>
      this.apiFetch<{ codigoPedido: string }>("POST", "/comercial/fa/Pedido/Salvar", {
        body: {
          Codigo: "",
          CodigoCliente: this.cfg.codigoCliente,
          DataPedido: pedido.dataPedido ?? hojeLocal(),
          CodigoCondicaoPagamento: pedido.codigoCondicaoPagamento ?? this.cfg.condicaoPagamento,
          CodigoControle: this.cfg.controle,
          CodigoUnidadeNegocio: this.cfg.unidadeNegocio,
          TipoNota: pedido.tipoNota ?? this.cfg.tipoNota,
          Observacao: pedido.observacao,
        },
      })
    );

    if (!data.success) {
      throw new CigamError(
        data.messages?.join("; ") || "Falha ao criar cabeçalho do pedido no CIGAM."
      );
    }

    const codigo = data.data?.codigoPedido;
    if (!codigo) throw new CigamError("CIGAM não retornou o número do pedido.");
    return String(codigo);
  }

  private async adicionarItem(
    codigoPedido: string,
    sequencia: number,
    item: CigamItemPedido,
    tabelaPreco: string,
    prazo: string
  ): Promise<void> {
    const data = await this.withAuthRetry(() =>
      this.apiFetch("POST", "/comercial/fa/Pedido/SalvarItemPedido", {
        body: {
          CodigoPedido: codigoPedido,
          Sequencia: sequencia,
          CodigoMaterial: item.codigoMaterial,
          Quantidade: item.quantidade,
          PrecoUnitario: item.precoUnitario,
          PrecoOriginal: item.precoUnitario,
          CodigoTabelaPreco: tabelaPreco,
          // Obrigatórios na prática, apesar de a doc marcar como opcionais.
          PrazoEntrega: prazo,
          PrazoProgramado: prazo,
          CodigoCentroArmazenagem: item.codigoCentroArmazenagem ?? this.cfg.centroArmazenagem,
        },
      })
    );

    if (!data.success) {
      throw new CigamError(
        data.messages?.join("; ") ||
          `Falha ao adicionar item ${item.codigoMaterial.trim()} (sequência ${sequencia}).`
      );
    }
  }

  /** Sem isto, "Tipo Operação"/CFOP e os totais do pedido ficam zerados. */
  async calcularImposto(codigoPedido: string): Promise<void> {
    const data = await this.withAuthRetry(() =>
      this.apiFetch("POST", "/comercial/fa/Pedido/CalcularImposto", {
        query: { codigoPedido },
      })
    );

    if (!data.success) {
      throw new CigamError(
        data.messages?.join("; ") || `Falha ao calcular impostos do pedido ${codigoPedido}.`
      );
    }
  }

  /** "20" (Pedido Gerado) -> "30" (Liberado para Faturamento). Este endpoint
   * NÃO valida se a transição é legal — sempre hardcodar "30" aqui. */
  async liberarPedidoParaFaturamento(codigoPedido: string): Promise<void> {
    const data = await this.withAuthRetry(() =>
      this.apiFetch("PUT", "/comercial/fa/Pedido/AtualizarControlePedido", {
        body: {
          Codigo: codigoPedido,
          CodigoCliente: this.cfg.codigoCliente,
          CodigoControle: "30",
        },
      })
    );

    if (!data.success) {
      throw new CigamError(
        data.messages?.join("; ") || `Falha ao liberar o pedido ${codigoPedido} para faturamento.`
      );
    }
  }

  /** Efetiva o pedido (controle "40") emitindo o documento CF1 — NF-e real,
   * transmite à SEFAZ. TipoFrete "F" (Sem Frete) com campos de transporte em
   * branco: outra combinação já rejeitou o XML na SEFAZ E queimou um número
   * sequencial de nota real (confirmado ao vivo no PDV). */
  async efetivarPedido(
    codigoPedido: string,
    itens: Array<{ sequencia: number; quantidade: number }>
  ): Promise<EfetivarResultado> {
    const agora = new Date();
    const data = await this.withAuthRetry(() =>
      this.apiFetch<{ codigoNotaFiscal?: string; erro?: string }>(
        "POST",
        "/comercial/fa/Pedido/Efetivar",
        {
          body: {
            Efetivacao: "S",
            Serie: this.cfg.serieNota,
            Transportadora: "",
            TipoFrete: "F",
            Placa: "",
            UF: "",
            Marca: "",
            Volume: 0,
            Quantidade: 0,
            Especie: "",
            DataSaida: hojeLocal(),
            HoraSaida: agora.toTimeString().slice(0, 8),
            UnidadeNegocio: this.cfg.unidadeNegocio,
            Pedido: {
              Codigo: codigoPedido,
              Itens: itens.map((i) => ({ SequenciaItem: i.sequencia, Quantidade: i.quantidade })),
            },
          },
          timeoutMs: TIMEOUT_EFETIVAR_MS,
        }
      )
    );

    return {
      success: data.success,
      codigoNotaFiscal: data.data?.codigoNotaFiscal || undefined,
      erro: data.data?.erro,
    };
  }

  /** Cria o pedido completo (cabeçalho + itens + cálculo de imposto). O
   * CIGAM gera o número do pedido — retornado em `cigamOrderId`.
   * `onHeaderCreated` roda logo após o cabeçalho, antes dos itens — persistir
   * o id imediatamente evita duplicata se a adição de itens falhar no meio.
   * Liberação para faturamento é best-effort: falha ali não invalida um
   * pedido já correto no CIGAM. Falha no cálculo de imposto é fatal. */
  async criarPedidoCompleto(
    pedido: CigamPedido,
    itens: CigamItemPedido[],
    onHeaderCreated?: (cigamOrderId: string) => Promise<void> | void
  ): Promise<{ cigamOrderId: string; itensEnviados: number; liberadoParaFaturamento: boolean }> {
    if (itens.length === 0) throw new CigamError(`Pedido ${pedido.codigo} sem itens.`);

    await this.ensureAuth();
    const cigamOrderId = await this.criarCabecalho(pedido);
    await onHeaderCreated?.(cigamOrderId);

    const tabela = pedido.tabelaPreco ?? this.cfg.tabelaPreco;
    const prazo = pedido.dataPedido ?? hojeLocal();
    let enviados = 0;
    for (const [index, item] of itens.entries()) {
      await this.adicionarItem(cigamOrderId, index + 1, item, tabela, prazo);
      enviados++;
    }

    await this.calcularImposto(cigamOrderId);

    let liberadoParaFaturamento = false;
    try {
      await this.liberarPedidoParaFaturamento(cigamOrderId);
      liberadoParaFaturamento = true;
    } catch (err) {
      console.error(
        `[cigam] pedido ${cigamOrderId} criado, mas não foi possível liberar para faturamento ` +
          `automaticamente — seguirá exigindo o passo manual "Situação" no CIGAM Desktop:`,
        err instanceof Error ? err.message : err
      );
    }

    return { cigamOrderId, itensEnviados: enviados, liberadoParaFaturamento };
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd ~/apps/totem-loja
git add automation/cigam/client.ts
git commit -m "feat: cliente CIGAM para o totem (portado de catalogo-funcionarios, série CF1)"
```

---

## Task 4: Processador de pedidos pendentes (`automation/cigam/process-pending-orders.ts`)

**Files:**
- Create: `~/apps/totem-loja/automation/cigam/process-pending-orders.ts`
- Test: `~/apps/totem-loja/automation/cigam/process-pending-orders.test.ts`

- [ ] **Step 1: Escrever o processador**

```typescript
/**
 * Processador de pedidos pendentes -> CIGAM.
 *
 * Busca pedidos com erp_status = PENDING, monta o pedido no formato do
 * CIGAM (convertendo quantidade conforme a unidade do material) e lança via
 * API. Grava o resultado em erp_status / erp_external_id / erp_nota_fiscal / erp_error.
 *
 * Conversão de quantidade (products.cigam_unit):
 * - KG:          quantidade = pacotes × peso do pacote; preço = R$/kg
 * - PCT/CX/UN:   quantidade = nº de pacotes;            preço = preço do pacote
 *
 * A efetivação (emissão do CF1, NF-e real) é AUTOMÁTICA por padrão — ver
 * efetivarSeConfigurado. Diferente do catálogo de funcionários (série REC,
 * "erro ao enviar a nota" é esperado), aqui uma falha na emissão É uma falha
 * de verdade: a série é CF1 e o objetivo é justamente transmitir à SEFAZ.
 *
 * Uso direto (simulação): npx tsx automation/cigam/process-pending-orders.ts
 * Execução real:          CIGAM_EXEC=1 npx tsx automation/cigam/process-pending-orders.ts
 */
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { CigamClient } from "./client";

type ItemRow = {
  product_name: string;
  quantity: number;
  unit_price_cents: number;
  products: {
    cigam_code: string | null;
    cigam_unit: string | null;
    weight: number | null;
  } | null;
};

type OrderRow = {
  id: string;
  order_number: string;
  customer_name: string | null;
  payment_method: string | null;
  erp_external_id: string | null;
  order_items: ItemRow[];
};

export type ProcessResult = {
  orderId: string;
  orderNumber: string;
  status: "DONE" | "ERROR" | "DRY_RUN";
  cigamCode?: string;
  notaFiscal?: string;
  aviso?: string;
  error?: string;
  payload?: unknown;
};

function buildObservacao(order: OrderRow): string {
  const nome = (order.customer_name ?? "CONSUMIDOR NAO IDENTIFICADO").toUpperCase();
  return `${nome} - PEDIDO ${order.order_number}`.slice(0, 251);
}

function resolveChannel(paymentMethod: string | null): "varejo" | "atacado" {
  return String(paymentMethod ?? "").toLowerCase().includes("atacado") ? "atacado" : "varejo";
}

function resolveTabelaPreco(channel: "varejo" | "atacado"): string {
  const tabela =
    channel === "atacado"
      ? process.env.CIGAM_TABELA_PRECO_ATACADO
      : process.env.CIGAM_TABELA_PRECO_VAREJO;
  if (!tabela) {
    throw new Error(
      `CIGAM_TABELA_PRECO_${channel.toUpperCase()} não configurada — ver plano de integração, Decisão de negócio #3.`
    );
  }
  return tabela;
}

export function buildItens(order: OrderRow) {
  const centroArmazenagem = process.env.CIGAM_CENTRO_ARMAZENAGEM ?? "001";

  return order.order_items.map((item) => {
    const produto = item.products;
    if (!produto?.cigam_code) {
      throw new Error(`Produto sem código CIGAM: ${item.product_name}`);
    }

    const unidade = (produto.cigam_unit ?? "UN").trim().toUpperCase();
    const peso = Number(produto.weight) > 0 ? Number(produto.weight) : 1;
    const porKg = unidade === "KG";
    const precoUnitarioReais = item.unit_price_cents / 100;

    return {
      codigoMaterial: produto.cigam_code,
      quantidade: porKg ? Number((item.quantity * peso).toFixed(3)) : item.quantity,
      precoUnitario: porKg
        ? Math.round((precoUnitarioReais / peso) * 100) / 100
        : precoUnitarioReais,
      unidadeMedida: unidade,
      codigoCentroArmazenagem: centroArmazenagem,
    };
  });
}

/**
 * Efetiva o pedido (controle 40) emitindo o documento CF1 (NF-e real).
 * Diferente do catálogo de funcionários: aqui uma falha na emissão VIRA
 * erro de verdade (não vira só um aviso), porque o objetivo é transmitir à
 * SEFAZ — não há tolerância a "erro ao enviar a nota" como no REC.
 */
async function efetivarSeConfigurado(
  cigam: CigamClient,
  cigamOrderId: string,
  itens: Array<{ quantidade: number }>,
  liberadoParaFaturamento: boolean
): Promise<{ notaFiscal?: string; aviso?: string; erroFatal?: string }> {
  if (process.env.CIGAM_AUTO_EFETIVAR_PEDIDO === "0") return {};

  if (!liberadoParaFaturamento) {
    return {
      aviso: `Pedido ${cigamOrderId} criado, mas não foi liberado para faturamento — efetivação não tentada. Concluir no CIGAM Desktop.`,
    };
  }

  try {
    const resultado = await cigam.efetivarPedido(
      cigamOrderId,
      itens.map((item, index) => ({ sequencia: index + 1, quantidade: item.quantidade }))
    );

    if (resultado.success) {
      return { notaFiscal: resultado.codigoNotaFiscal };
    }

    const motivo = resultado.erro?.trim() || "o CIGAM não informou o motivo";
    return {
      notaFiscal: resultado.codigoNotaFiscal,
      erroFatal: `Pedido ${cigamOrderId} criado, mas a emissão do CF1 falhou: ${motivo}. Conferir a situação do pedido no CIGAM Desktop — pode já ter consumido um número de nota.`,
    };
  } catch (err: any) {
    return {
      erroFatal: `Pedido ${cigamOrderId} criado, mas a efetivação falhou: ${String(
        err?.message ?? err
      ).slice(0, 300)}. Concluir no CIGAM Desktop.`,
    };
  }
}

export async function processPendingOrders(options: {
  supabase: SupabaseClient;
  limit?: number;
  dryRun?: boolean;
}): Promise<ProcessResult[]> {
  const { supabase, limit = 10, dryRun = true } = options;

  const { data: orders, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, customer_name, payment_method, erp_external_id, order_items(product_name, quantity, unit_price_cents, products(cigam_code, cigam_unit, weight))"
    )
    .eq("erp_status", "PENDING")
    .is("cancelled_at", null)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(`Falha ao buscar pedidos pendentes: ${error.message}`);

  const rows = (orders ?? []) as unknown as OrderRow[];
  if (rows.length === 0) return [];

  const cigam = new CigamClient();
  const results: ProcessResult[] = [];

  for (const order of rows) {
    try {
      const channel = resolveChannel(order.payment_method);
      const itens = buildItens(order);
      const pedido = {
        codigo: order.order_number,
        observacao: buildObservacao(order),
        dataPedido: new Date().toISOString().slice(0, 10),
        codigoCondicaoPagamento: process.env.CIGAM_CONDICAO_PAGAMENTO,
        tabelaPreco: resolveTabelaPreco(channel),
        tipoNota: process.env.CIGAM_TIPO_NOTA,
      };

      if (dryRun) {
        results.push({
          orderId: order.id,
          orderNumber: order.order_number,
          status: "DRY_RUN",
          payload: { pedido, itens },
        });
        continue;
      }

      if (order.erp_external_id) {
        const message = `Cabeçalho já existe no CIGAM (${order.erp_external_id}) de tentativa anterior; itens podem estar incompletos. Conferir/completar na tela antes de reprocessar.`;
        await supabase
          .from("orders")
          .update({ erp_status: "ERROR", erp_error: message })
          .eq("id", order.id)
          .then(() => undefined, () => undefined);
        results.push({ orderId: order.id, orderNumber: order.order_number, status: "ERROR", error: message });
        continue;
      }

      const { cigamOrderId, liberadoParaFaturamento } = await cigam.criarPedidoCompleto(
        pedido,
        itens,
        async (id) => {
          await supabase.from("orders").update({ erp_external_id: id }).eq("id", order.id);
        }
      );

      const { notaFiscal, aviso, erroFatal } = await efetivarSeConfigurado(
        cigam,
        cigamOrderId,
        itens,
        liberadoParaFaturamento
      );

      const { error: updateError } = await supabase
        .from("orders")
        .update({
          erp_status: erroFatal ? "ERROR" : "DONE",
          erp_error: erroFatal ?? aviso ?? null,
          erp_external_id: cigamOrderId,
          erp_nota_fiscal: notaFiscal ?? null,
          erp_synced_at: new Date().toISOString(),
        })
        .eq("id", order.id);

      if (updateError) {
        const message =
          `Pedido ${cigamOrderId} foi criado no CIGAM` +
          (notaFiscal ? ` e o documento ${notaFiscal} foi emitido` : "") +
          `, mas NÃO foi possível gravar isso no Supabase: ${updateError.message}. ` +
          `Reconciliar o pedido ${order.order_number} manualmente antes de reprocessar.`;
        console.error(`❌ [cigam] ${message}`);
        results.push({
          orderId: order.id,
          orderNumber: order.order_number,
          status: "ERROR",
          cigamCode: cigamOrderId,
          notaFiscal,
          error: message,
        });
        continue;
      }

      results.push({
        orderId: order.id,
        orderNumber: order.order_number,
        status: erroFatal ? "ERROR" : "DONE",
        cigamCode: cigamOrderId,
        notaFiscal,
        aviso,
        error: erroFatal,
      });
    } catch (err: any) {
      const message = String(err?.message ?? err).slice(0, 500);

      if (!dryRun) {
        await supabase
          .from("orders")
          .update({ erp_status: "ERROR", erp_error: message })
          .eq("id", order.id)
          .then(() => undefined, () => undefined);
      }

      results.push({
        orderId: order.id,
        orderNumber: order.order_number,
        status: "ERROR",
        error: message,
      });
    }
  }

  return results;
}

// Execução direta via CLI
if (process.argv[1]?.endsWith("process-pending-orders.ts")) {
  (async () => {
    const dotenv = await import("dotenv");
    dotenv.config();

    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    const dryRun = process.env.CIGAM_EXEC !== "1";
    console.log(dryRun ? "🧪 Modo SIMULAÇÃO (nada será enviado/gravado)" : "🚀 Modo EXECUÇÃO REAL");

    const results = await processPendingOrders({ supabase, dryRun });
    if (results.length === 0) {
      console.log("👌 Nenhum pedido pendente para processar.");
      return;
    }

    for (const r of results) {
      console.log(`\n===== ${r.orderNumber} → ${r.status}${r.cigamCode ? ` (CIGAM ${r.cigamCode})` : ""}`);
      if (r.notaFiscal) console.log(`   📄 CF1 emitido: ${r.notaFiscal}`);
      if (r.aviso) console.log("   ⚠️ ", r.aviso);
      if (r.error) console.log("   erro:", r.error);
      if (r.payload) console.log(JSON.stringify(r.payload, null, 2));
    }
  })().catch((err) => {
    console.error("❌ Falha no processamento:", err?.message ?? err);
    process.exit(1);
  });
}
```

- [ ] **Step 2: Escrever teste unitário de `buildItens` (conversão de quantidade/preço por KG)**

```typescript
// automation/cigam/process-pending-orders.test.ts
import { describe, expect, it } from "vitest";
import { buildItens } from "./process-pending-orders";

describe("buildItens", () => {
  it("converte quantidade e preço para material vendido por KG", () => {
    const order = {
      id: "1",
      order_number: "T-0001",
      customer_name: "CLIENTE TESTE",
      payment_method: "attendant",
      erp_external_id: null,
      order_items: [
        {
          product_name: "Pão de Queijo PCT 1KG",
          quantity: 2, // 2 pacotes
          unit_price_cents: 2500, // R$25,00 pelo pacote de 1kg
          products: { cigam_code: "002001000001", cigam_unit: "KG", weight: 1 },
        },
      ],
    };

    const itens = buildItens(order as any);

    expect(itens).toEqual([
      {
        codigoMaterial: "002001000001",
        quantidade: 2, // 2 pacotes * 1kg
        precoUnitario: 25, // R$25/kg (peso=1, preço do pacote = preço/kg)
        unidadeMedida: "KG",
        codigoCentroArmazenagem: "001",
      },
    ]);
  });

  it("mantém quantidade/preço direto para material vendido por UN", () => {
    const order = {
      id: "1",
      order_number: "T-0002",
      customer_name: "CLIENTE TESTE",
      payment_method: "attendant",
      erp_external_id: null,
      order_items: [
        {
          product_name: "Refrigerante Lata UN",
          quantity: 3,
          unit_price_cents: 500,
          products: { cigam_code: "002002000005", cigam_unit: "UN", weight: 0 },
        },
      ],
    };

    const itens = buildItens(order as any);

    expect(itens).toEqual([
      {
        codigoMaterial: "002002000005",
        quantidade: 3,
        precoUnitario: 5,
        unidadeMedida: "UN",
        codigoCentroArmazenagem: "001",
      },
    ]);
  });

  it("lança erro se o produto não tem cigam_code", () => {
    const order = {
      id: "1",
      order_number: "T-0003",
      customer_name: "CLIENTE TESTE",
      payment_method: "attendant",
      erp_external_id: null,
      order_items: [
        {
          product_name: "Produto sem mapeamento",
          quantity: 1,
          unit_price_cents: 100,
          products: { cigam_code: null, cigam_unit: null, weight: null },
        },
      ],
    };

    expect(() => buildItens(order as any)).toThrow("Produto sem código CIGAM");
  });
});
```

- [ ] **Step 3: Adicionar `vitest` e rodar o teste**

O `package.json` do totem não tem `vitest` nem script `test` hoje (diferente do catalogo-funcionarios). Adicionar:

```bash
cd ~/apps/totem-loja
npm install -D vitest
```

Editar `package.json`, dentro de `"scripts"`, adicionar:

```json
    "test": "vitest run",
```

Rodar: `npx vitest run automation/cigam/process-pending-orders.test.ts`
Expected: 3 passed.

- [ ] **Step 4: Adicionar scripts `cigam:check` e `cigam:pending` ao `package.json`**

Dentro de `"scripts"`, junto dos existentes `automation:webhook`/`automation:runner`:

```json
    "cigam:pending": "tsx automation/cigam/process-pending-orders.ts",
```

(o `cigam:check` é adicionado na Task 8, junto com o arquivo `check.ts`.)

- [ ] **Step 5: Commit**

```bash
cd ~/apps/totem-loja
git add automation/cigam/process-pending-orders.ts automation/cigam/process-pending-orders.test.ts package.json package-lock.json
git commit -m "feat: processador de pedidos pendentes -> CIGAM (série CF1, efetivação automática)"
```

---

## Task 5: Adaptar o checkout (`src/services/orders.ts`) — remover SAIBWEB do fluxo síncrono

**Contexto:** o CIGAM é lançado por um processo assíncrono separado (Task 4), não durante o checkout. `orders.ts` só precisa parar de chamar `finalizeSaibweb`/`enqueueSaibwebOrder` — o pedido já nasce com `erp_status = 'PENDING'` (Task 1) e o processo de sync (Task 9) cuida do resto sozinho.

**Files:**
- Modify: `~/apps/totem-loja/src/services/orders.ts`

- [ ] **Step 1: Remover as constantes e funções ligadas ao webhook SAIBWEB**

Remover (linhas próximas ao topo do arquivo):

```typescript
const SAIBWEB_WEBHOOK_URL = import.meta.env.VITE_SAIBWEB_WEBHOOK_URL?.trim() || "";
const SAIBWEB_WEBHOOK_TOKEN = import.meta.env.VITE_SAIBWEB_WEBHOOK_TOKEN?.trim() || "";
const SAIBWEB_TIMEOUT_MS = 12000;
```

e as funções `resolveSaibwebWebhookUrl`, `markSaibwebFailure`, `markSaibwebPendingRetry`, `markSaibwebQueued`, `enqueueSaibwebOrder`, `shouldRetrySaibwebEnqueue` — inteiras, não sobra nenhuma referência a SAIBWEB no arquivo.

- [ ] **Step 2: Substituir `finalizeSaibweb` por uma função que só registra o evento (sem rede)**

```typescript
async function finalizeOrder(orderId: string, orderNumber: string | null): Promise<CreateOrderResult> {
  await recordOrderEventSafe({
    eventName: "order_erp_status",
    severity: "info",
    message: "Pedido criado e aguardando sincronização com o CIGAM.",
    payload: {
      orderId,
      orderNumber,
    },
  });

  return { orderId, orderNumber };
}
```

- [ ] **Step 3: Atualizar o tipo `CreateOrderResult`**

```typescript
type CreateOrderResult = {
  orderId: string;
  orderNumber: string | null;
};
```

(Remove `saibwebQueued`/`saibwebError` — nada mais consome esses campos depois desta troca; verificar no Step 6 se alguma tela/componente lê esses campos do retorno de `createOrder` antes de remover, e adaptar lá também.)

- [ ] **Step 4: Trocar as duas chamadas a `finalizeSaibweb(...)` por `finalizeOrder(...)`**

Em `tryCreateOrderViaRpc`, trocar:
```typescript
  return finalizeSaibweb(row.order_id, row.order_number ?? null);
```
por:
```typescript
  return finalizeOrder(row.order_id, row.order_number ?? null);
```

Em `createOrderViaClientFallback`, trocar:
```typescript
  return finalizeSaibweb(orderId, orderNumber);
```
por:
```typescript
  return finalizeOrder(orderId, orderNumber);
```

- [ ] **Step 5: Atualizar o insert do fallback client-side para gravar `erp_status: "PENDING"` em vez de `saibweb_status`**

Em `createOrderViaClientFallback`, no `.insert({...})` do pedido, trocar:
```typescript
      wallet_debited: false,
      spent_from_balance_cents: 0,
      status: "aguardando_atendimento",
      saibweb_status: "PENDING",
      saibweb_error: null,
    })
```
por:
```typescript
      wallet_debited: false,
      spent_from_balance_cents: 0,
      status: "aguardando_atendimento",
      erp_status: "PENDING",
      erp_error: null,
    })
```

- [ ] **Step 6: Buscar e adaptar quem consome `saibwebQueued`/`saibwebError` no restante do app**

```bash
cd ~/apps/totem-loja
grep -rn "saibwebQueued\|saibwebError" src/
```

Para cada resultado, remover a leitura desses campos (ex.: telas de confirmação de pedido que hoje mostram "aguardando SAIBWEB" — trocar por uma mensagem genérica de "pedido confirmado" já que o CIGAM roda em segundo plano sem o cliente esperar).

- [ ] **Step 7: Rodar lint e build**

```bash
npm run lint
npm run build
```
Expected: sem erros novos (nenhuma referência solta a `SAIBWEB_WEBHOOK_URL`/`finalizeSaibweb`).

- [ ] **Step 8: Commit**

```bash
cd ~/apps/totem-loja
git add src/services/orders.ts
git commit -m "refactor: checkout do totem não chama mais o webhook SAIBWEB, pedido nasce erp_status=PENDING"
```

---

## Task 6: Desligar a automação SAIBWEB

**Contexto:** decisão já tomada — CIGAM substitui SAIBWEB. Não apagar o código (fica de referência/histórico e pode voltar a ser útil), só parar de rodar. `automation/saibweb-webhook.ts` roda como pm2 `totem-loja-webhook` (o `saibweb-runner.ts` é disparado por ele via `child_process.spawn`, não é processo pm2 separado).

**Files:**
- Modify: `~/apps/totem-loja/.env` (comentar `VITE_SAIBWEB_WEBHOOK_URL`)
- No código: nenhuma mudança — o front já para de chamar o webhook na Task 5.

- [ ] **Step 1: Confirmar que não há mais nada chamando o webhook SAIBWEB antes de parar o processo**

```bash
ssh xulio@192.168.100.128 'grep -rn "SAIBWEB_WEBHOOK" ~/apps/totem-loja/src/'
```
Expected: nenhum resultado (Task 5 já removeu todas as referências).

- [ ] **Step 2: Parar e remover o processo pm2 `totem-loja-webhook`**

```bash
ssh xulio@192.168.100.128 '
  source ~/.nvm/nvm.sh &&
  pm2 stop totem-loja-webhook &&
  pm2 delete totem-loja-webhook &&
  pm2 save
'
```
Expected: pm2 confirma stop + delete; `pm2 save` regrava o dump para não subir de novo num reboot.

- [ ] **Step 3: Comentar a variável do webhook no `.env` do totem (documentação, não obrigatório pro funcionamento)**

No `~/apps/totem-loja/.env`, no servidor, comentar a linha:
```
VITE_SAIBWEB_WEBHOOK_URL=/webhook/new-order
```
adicionando `#` na frente, com um comentário acima: `# Desligado em favor do CIGAM (ver docs/superpowers/plans/2026-08-20-integracao-cigam.md)`.

- [ ] **Step 4: Rebuild do frontend (a env mudou) e restart**

```bash
ssh xulio@192.168.100.128 '
  source ~/.nvm/nvm.sh &&
  cd ~/apps/totem-loja &&
  npm run build &&
  pm2 restart totem-loja-frontend &&
  pm2 save
'
```

Depois, verificar que o processo reiniciou de fato com o build novo (mesmo cuidado documentado no PDV — "rebuild em disco não afeta processo já rodando" não se aplica aqui porque `pm2 restart` mata e sobe de novo, mas confirmar mesmo assim):
```bash
ssh xulio@192.168.100.128 'source ~/.nvm/nvm.sh && pm2 describe totem-loja-frontend | grep -E "uptime|status"'
```
Expected: status `online`, uptime baixo (segundos/minutos, não dias).

- [ ] **Step 5: Commit**

```bash
cd ~/apps/totem-loja
git add .env.example  # se existir um .env.example equivalente no repo, comentar lá também
git commit -m "chore: desliga integração SAIBWEB (substituída por CIGAM)"
```

(O `.env` real do servidor é gitignorado — a mudança nele não entra em commit, só a nota no `.env.example` se existir um.)

---

## Task 7: Variáveis de ambiente CIGAM no `.env` do totem

**✅ DESBLOQUEADO — decisões de negócio confirmadas pelo dono em 2026-08-20** (ver topo do plano). Valores reais já definidos: `CIGAM_UNIDADE_NEGOCIO=100`, `CIGAM_CONDICAO_PAGAMENTO=500`, `CIGAM_TABELA_PRECO_VAREJO=002`, `CIGAM_TABELA_PRECO_ATACADO=003`.

**Files:**
- Modify: `~/apps/totem-loja/.env` (no servidor)

- [ ] **Step 1: Adicionar as variáveis confirmadas (copiadas fielmente do que já existe no PDV/catálogo de funcionários)**

```bash
############################################
# 🏭 CIGAM — Integração ERP
############################################
CIGAM_BASE_URL=https://gostinhomineiroportais.cigam.cloud/api/api
CIGAM_API_USER=winiston.a
CIGAM_API_PASS=<mesma senha usada no PDV/catalogo-funcionarios — copiar de ~/apps/pdv-gm/server/.env>
CIGAM_PORTAL_PATH=/portalrepresentante

# Consumidor genérico — mesmo código do PDV (CIGAM_CLIENTE_CONSUMIDOR lá)
CIGAM_CODIGO_CLIENTE=5

CIGAM_CENTRO_ARMAZENAGEM=001
CIGAM_CONTROLE=20

# Série CF1 — cupom fiscal REAL, transmite à SEFAZ (diferente do REC do
# catálogo de funcionários). Ver plano de teste na Task 8 antes de ligar em produção.
CIGAM_NOTA_SERIE=CF1
CIGAM_AUTO_EFETIVAR_PEDIDO=1

# --- Confirmado pelo dono em 2026-08-20 ---
CIGAM_UNIDADE_NEGOCIO=100
CIGAM_CONDICAO_PAGAMENTO=500
CIGAM_TABELA_PRECO_VAREJO=002
CIGAM_TABELA_PRECO_ATACADO=003
```

- [ ] **Step 2: Restart do processo de sync (criado na Task 9) para carregar as novas vars**

(Coberto no fim da Task 9 — não repetir aqui, só uma nota: qualquer mudança no `.env` exige restart do processo `totem-loja-cigam`, ele não recarrega `.env` sozinho.)

---

## Task 8: Smoke test de login + plano de teste manual seguro

**Files:**
- Create: `~/apps/totem-loja/automation/cigam/check.ts`

- [ ] **Step 1: Escrever o smoke test**

```typescript
/**
 * Smoke test da conexão com o CIGAM (somente login no portal, não cria nada).
 * Uso: npm run cigam:check
 */
import dotenv from "dotenv";
dotenv.config();

import { CigamClient } from "./client";

async function main() {
  const client = new CigamClient();

  console.log("🔐 Logando no portal do representante...");
  await client.autenticar();
  console.log("✅ Login OK — sessão do portal criada (CGPortal_Token).");

  const ok = await client.verificarSessao();
  console.log(ok ? "✅ Sessão válida." : "❌ Sessão inválida.");

  console.log("\n🏁 Conexão com o CIGAM OK.");
}

main().catch((err) => {
  console.error("❌ Falha no check do CIGAM:", err?.message ?? err);
  process.exit(1);
});
```

- [ ] **Step 2: Adicionar o script no `package.json`**

```json
    "cigam:check": "tsx automation/cigam/check.ts",
```

- [ ] **Step 3: Rodar no servidor**

```bash
ssh xulio@192.168.100.128 'source ~/.nvm/nvm.sh && cd ~/apps/totem-loja && npm run cigam:check'
```
Expected: `✅ Login OK` / `✅ Sessão válida.` / `🏁 Conexão com o CIGAM OK.`

**⚠️ Atenção:** o CIGAM permite só UMA sessão ativa por usuário (`winiston.a`). Rodar isto enquanto o PDV ou o catálogo de funcionários estão logados com o mesmo usuário **derruba a sessão deles** (erro 500 "Usuário não autenticado" do lado de lá, não 401 — pode não ser óbvio o motivo). Confirmar com o dono um horário de baixo movimento antes de rodar (mesmo cuidado documentado no catálogo de funcionários: "rodar só depois das 16:45, com a loja fechada").

- [ ] **Step 4: Plano de teste manual E2E — validar UM pedido real sem risco fiscal**

Fazer em duas etapas, para nunca queimar um número de NF real por engano:

**Etapa A — dry-run completo (sem `CIGAM_EXEC=1`, sem nada indo pro CIGAM):**
```bash
ssh xulio@192.168.100.128 'source ~/.nvm/nvm.sh && cd ~/apps/totem-loja && npm run cigam:pending'
```
Fazer isso com pelo menos 1 pedido real em `erp_status = 'PENDING'` no banco (criar um pedido de teste pequeno pelo totem de verdade, 1 item, produto já mapeado com `cigam_code`). Expected: imprime o payload que SERIA enviado (`pedido`/`itens`) — conferir visualmente: `codigoMaterial` bate com o produto certo, `quantidade`/`precoUnitario` fazem sentido, `tabelaPreco` não é `undefined`.

**Etapa B — execução real, mas com `CIGAM_AUTO_EFETIVAR_PEDIDO=0` temporário (cria o pedido no CIGAM até "Liberado para Faturamento", SEM emitir NF-e):**
```bash
ssh xulio@192.168.100.128 '
  source ~/.nvm/nvm.sh &&
  cd ~/apps/totem-loja &&
  CIGAM_EXEC=1 CIGAM_AUTO_EFETIVAR_PEDIDO=0 npm run cigam:pending
'
```
Expected: pedido criado, `erp_status = 'DONE'`, `erp_external_id` preenchido com um número de pedido real do CIGAM, `erp_nota_fiscal` vazio (não efetivou). **Abrir esse pedido no CIGAM Desktop e conferir manualmente**: cliente = Consumidor genérico certo, unidade de negócio certa, itens/quantidades/preços batendo com o pedido de teste, totais preenchidos (prova que `CalcularImposto` rodou).

**Etapa C — só depois da Etapa B validada pelo dono, testar a efetivação real (emite CF1 de verdade) com `CIGAM_AUTO_EFETIVAR_PEDIDO=1`** (o padrão do `.env` final da Task 7) — usando um segundo pedido de teste pequeno, criado especificamente pra isso, para não misturar com o pedido da Etapa B (que ficou parado em "Liberado", sem nota). Confirmar o CF1 aparece no CIGAM Desktop com o valor certo.

- [ ] **Step 5: Commit**

```bash
cd ~/apps/totem-loja
git add automation/cigam/check.ts package.json
git commit -m "feat: smoke test de login CIGAM (npm run cigam:check)"
```

---

## Task 9: Deploy — processo pm2 de sincronização + restart dos serviços

**Contexto:** seguindo o padrão real já em uso no servidor (serviços pm2 de longa duração, não cron — o crontab do usuário `xulio` só tem uma entrada, para `automation:sheet-sync` do catálogo de funcionários; os outros scripts de automação rodam via pm2). Criar um pequeno serviço que chama `processPendingOrders` em loop, análogo ao auto-drain que o `saibweb-webhook.ts` já fazia.

**Files:**
- Create: `~/apps/totem-loja/automation/cigam-sync-service.ts`

- [ ] **Step 1: Escrever o serviço de loop**

```typescript
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
```

- [ ] **Step 2: Adicionar `CIGAM_SYNC_INTERVAL_MS` ao `.env` do servidor**

```
CIGAM_SYNC_INTERVAL_MS=60000
```

- [ ] **Step 3: Subir o processo no pm2**

```bash
ssh xulio@192.168.100.128 '
  source ~/.nvm/nvm.sh &&
  cd ~/apps/totem-loja &&
  pm2 start "npx tsx automation/cigam-sync-service.ts" --name totem-loja-cigam &&
  pm2 save
'
```

- [ ] **Step 4: Confirmar que subiu e está processando**

```bash
ssh xulio@192.168.100.128 'source ~/.nvm/nvm.sh && pm2 describe totem-loja-cigam | grep -E "status|uptime" && pm2 logs totem-loja-cigam --lines 20 --nostream'
```
Expected: status `online`, log mostrando `🧩 CIGAM sync rodando` e, se houver pedido de teste pendente, o resultado do primeiro ciclo.

- [ ] **Step 5: Commit**

```bash
cd ~/apps/totem-loja
git add automation/cigam-sync-service.ts
git commit -m "feat: serviço pm2 de sincronização CIGAM em loop (totem-loja-cigam)"
```

- [ ] **Step 6: Push**

```bash
cd ~/apps/totem-loja
git push origin main
```

(O repo estava 5 commits à frente do `origin/main` mesmo antes deste plano começar — revisar com o dono se esses 5 commits anteriores também devem subir junto, ou se só os desta integração.)

---

## Self-Review

**Cobertura do escopo:**
- ✅ Migration de schema (Task 1) — colunas CIGAM em `products`/`orders`, `create_order_v1` atualizada.
- ✅ Mapeamento de produtos (Task 2) — script de matching com relatório antes de gravar.
- ✅ Cliente CIGAM adaptado (Task 3) — cliente Consumidor genérico, série CF1, trimado do que não se aplica.
- ✅ Processador de pendentes (Task 4) — schema real do totem, testes unitários da conversão KG.
- ✅ Checkout adaptado (Task 5) — sem chamada síncrona ao SAIBWEB.
- ✅ Desligamento do SAIBWEB (Task 6) — pm2 parado, código preservado.
- ✅ Variáveis de ambiente (Task 7) — valores confirmados vs. pendentes claramente separados.
- ✅ Smoke test + plano de teste seguro (Task 8) — dry-run → sem efetivar → efetivar de verdade, nessa ordem.
- ✅ Deploy (Task 9) — processo pm2 análogo ao padrão já usado no servidor.

**Placeholders:** nenhum "TBD"/"implementar depois" nos passos executáveis — os únicos valores em aberto (`CIGAM_UNIDADE_NEGOCIO`, `CIGAM_CONDICAO_PAGAMENTO`, `CIGAM_TABELA_PRECO_*`) estão isolados na seção de decisões de negócio no topo e na Task 7, marcados como bloqueio explícito, não escondidos dentro de um passo de código.

**Consistência de tipos:** `CreateOrderResult`, `OrderRow`, `ItemRow`, `CigamPedido`, `CigamItemPedido` usados de forma consistente entre Tasks 3-5; `erp_status`/`erp_external_id`/`erp_error`/`erp_nota_fiscal`/`erp_synced_at` são os mesmos nomes de coluna do Task 1 até o Task 9.
