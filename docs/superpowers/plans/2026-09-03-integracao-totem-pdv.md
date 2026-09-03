# Integração Totem → PDV (pagamento no caixa) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pedidos digitados pelo cliente no totem de autoatendimento aparecem numa aba nova "Totem" dentro do PDV; a atendente do caixa abre o pedido, revisa com o cliente e cobra pelo fluxo normal de venda do PDV — que já cria o pedido no CIGAM, emite a NF real e permite imprimir a via para a portaria separar. O totem não fala mais com o CIGAM.

**Architecture:** Dois sistemas (`totem-loja` e `pdv-gm`), cada um com seu próprio Supabase Cloud, ligados por dois scripts novos rodando no totem (mesmo padrão pm2 já usado): um empurra pedidos novos do totem para uma tabela nova `pedidos_totem` no Supabase do PDV; outro lê de volta os pedidos que o PDV já vendeu e fecha o pedido correspondente no totem (pago, com número da NF). O PDV ganha uma tela nova, irmã da já existente "Pedidos Pré-Digitados", e o fluxo de venda existente (`POST /orders`) ganha um campo novo (`totemOrderNumber`) só para saber gravar essa referência.

**Tech Stack:** totem-loja (React 18 + Vite 5 + TS + Supabase JS, automation scripts rodando via `tsx`/pm2), pdv-gm (Express + TS no backend, React + Vite no frontend, Supabase JS), Supabase Cloud (dois projetos separados), CIGAM REST (só do lado do PDV a partir de agora).

---

## Antes de começar — contexto que você precisa saber

- **Servidor:** tudo roda em produção no `gmserver` (`ssh xulio@192.168.100.128`). Os repos ficam em `~/apps/totem-loja` e `~/apps/pdv-gm`. Editar e testar direto lá (não há cópia local válida).
- **totem-loja usa Node v25.8.1 via nvm** — antes de rodar `npm`/`npx`/`tsx`:
  ```bash
  export NVM_DIR=$HOME/.nvm; source $NVM_DIR/nvm.sh
  export PATH=/home/xulio/.nvm/versions/node/v25.8.1/bin:$PATH
  ```
- **pm2** só está no PATH em shell de login (`ssh host 'bash -lc "..."'`), não em `ssh host "comando"` puro.
- **CIGAM_AUTO_EFETIVAR_PEDIDO no totem já está em `0`** (Task 12 deste plano vai aposentar esse serviço de vez — não precisa religar).
- **`totem-loja-cigam`** é o processo pm2 que hoje cria pedido-rascunho no CIGAM a partir do totem. Este plano o substitui por um processo novo (`totem-pdv-sync`) que empurra pedidos para o PDV em vez de falar com o CIGAM.
- **Produtos do totem já têm `cigam_code`/`cigam_unit`** preenchidos (177 de 178; o único ativo faltante, Pão de Queijo Gourmet 1kg, está com `active=false` até alguém cadastrar o material 1kg no CIGAM Desktop — fora do escopo deste plano).
- **PDV já valida tudo isso em produção**: sessão de caixa aberta, estoque em cache, cliente CIGAM (se houver), idempotência por `idempotencyKey`. Nenhuma dessas regras muda — só estamos adicionando uma origem nova de pedido pré-montado.

---

## Mapa de arquivos

**totem-loja** (`~/apps/totem-loja`):
- `supabase/migrations/2026-09-03-pdv-sync-columns.sql` — cria: `orders.pdv_sync_status`, `orders.pdv_synced_at`, `orders.pdv_order_number`, `orders.pdv_nota_fiscal`, `orders.paid_at`.
- `automation/pdv-sync/push-to-pdv.ts` — novo: lê pedidos totem sem `pdv_sync_status`, escreve em `pedidos_totem` no Supabase do PDV.
- `automation/pdv-sync/pull-from-pdv.ts` — novo: lê `orders` do PDV por `totem_order_number`, fecha o pedido no totem.
- `automation/pdv-sync/sync-loop.ts` — novo: laço que chama os dois acima a cada N segundos (substitui `automation/cigam-sync-service.ts` no pm2).
- `automation/pdv-sync/push-to-pdv.test.ts`, `automation/pdv-sync/pull-from-pdv.test.ts` — novos, testes unitários.
- `.env` — 2 vars novas: `PDV_SUPABASE_URL`, `PDV_SUPABASE_SERVICE_ROLE_KEY`.
- `ecosystem.config.cjs` — remove app `totem-loja-cigam`, adiciona `totem-pdv-sync`.

**pdv-gm** (`~/apps/pdv-gm`):
- `server/supabase/migrations/0020_pedidos_totem.sql` — cria tabela `pedidos_totem` + coluna `orders.totem_order_number`.
- `server/src/orders/totemOrderService.ts` — novo: `listTotemOrders`, `deleteTotemOrder` (espelha `preOrderService.ts`).
- `server/src/orders/totemOrderService.test.ts` — novo.
- `server/src/routes/api.ts` — adiciona `GET /totem-orders`, `DELETE /totem-orders/:id`; adiciona `totemOrderNumber` em `NewOrderInput`.
- `server/src/orders/orderService.ts` — adiciona `totemOrderNumber?: string` em `NewOrderInput`, grava na `orders` insert.
- `server/src/routes/orderValidation.ts` — aceita `totemOrderNumber` opcional no body.
- `src/lib/api.ts` — `fetchTotemOrders`, `deleteTotemOrder`, `createOrder` passa `totemOrderNumber`.
- `src/contexts/CartContext.tsx` — `SaleContext` ganha `totemOrderNumber?: string`; `carregarPedido` já aceita `sale` genérico, sem mudança de assinatura.
- `src/pages/PedidosTotem.tsx` — novo, espelha `PedidosPreDigitados.tsx`.
- `src/pages/PedidosTotem.test.tsx` — novo.
- `src/pages/Home.tsx` — novo botão "Totem".
- `src/App.tsx` (ou onde as rotas estão declaradas) — nova rota `/pedidos-totem`, e monta `<AvisoPedidoTotem />` ao lado de `<AvisoFecharCaixa />`.
- `src/components/AvisoPedidoTotem.tsx` — novo: aviso no canto da tela quando chega pedido novo do totem.
- `src/components/AvisoPedidoTotem.test.tsx` — novo.

---

## Task 1: Migration no totem — colunas de sync com o PDV

**Files:**
- Create: `~/apps/totem-loja/supabase/migrations/2026-09-03-pdv-sync-columns.sql` (o repo nomeia migrations por data, ex. `2026-08-20-cigam-integration.sql` — conferir com `ls ~/apps/totem-loja/supabase/migrations/` antes de criar o arquivo e seguir esse padrão, não o de timestamp)

- [ ] **Step 1: Escrever a migration**

```sql
-- 2026-09-03-pdv-sync-columns.sql
-- Substitui o fluxo antigo (totem cria rascunho no CIGAM) por: totem empurra
-- o pedido pro PDV, PDV vende de verdade e o totem só registra o resultado.

alter table public.orders
  add column if not exists pdv_sync_status text
    check (pdv_sync_status in ('PENDING', 'SENT', 'ERROR')),
  add column if not exists pdv_sync_error text,
  add column if not exists pdv_synced_at timestamptz,
  add column if not exists pdv_order_number text,
  add column if not exists pdv_nota_fiscal text,
  add column if not exists paid_at timestamptz;

comment on column public.orders.pdv_sync_status is
  'Estado do envio deste pedido para a fila de caixa do PDV (pedidos_totem). NULL = ainda não tentado.';
comment on column public.orders.paid_at is
  'Preenchido quando o caixa do PDV efetivamente cobra o pedido (ver automation/pdv-sync/pull-from-pdv.ts).';
```

- [ ] **Step 2: Aplicar no Supabase do totem**

Não há CLI do Supabase configurado neste projeto para esse ambiente — aplicar direto pelo SQL Editor do Supabase Studio do projeto `jsltcdtwdeemwchfyylk` (ver referência `reference_supabase_totem` na memória), colando o conteúdo do arquivo acima. Confirmar rodando, no mesmo SQL Editor:

```sql
select column_name from information_schema.columns
where table_name = 'orders' and column_name like 'pdv_%' or column_name = 'paid_at';
```

Esperado: 6 linhas (`pdv_sync_status`, `pdv_sync_error`, `pdv_synced_at`, `pdv_order_number`, `pdv_nota_fiscal`, `paid_at`).

- [ ] **Step 3: Commit**

```bash
cd ~/apps/totem-loja
git add supabase/migrations/2026-09-03-pdv-sync-columns.sql
git commit -m "feat: colunas de sincronismo com o PDV na tabela orders"
```

---

## Task 2: Migration no PDV — tabela `pedidos_totem` + coluna de referência

**Files:**
- Create: `~/apps/pdv-gm/server/supabase/migrations/0020_pedidos_totem.sql` (o repo numera migrations sequencialmente, `0001` a `0019` hoje — conferir com `ls ~/apps/pdv-gm/server/supabase/migrations/` antes de criar, e usar o próximo número livre; se já existir `0020` quando este Task rodar, usar `0021`)

- [ ] **Step 1: Escrever a migration**

Espelha `pedidos_pre_digitados` (mesmo `items_json`), mas sem `cashier_id`/`cashier_name` (o pedido não foi adiantado por nenhum operador) e com a referência de volta pro totem:

```sql
-- 0020_pedidos_totem.sql
create table if not exists public.pedidos_totem (
  id uuid primary key default gen_random_uuid(),
  totem_order_id uuid not null unique,
  totem_order_number text not null,
  customer_name text not null,
  customer_phone text,
  price_table text not null default '002',
  cigam_cliente_codigo text,
  observacao text,
  items_json jsonb not null,
  created_at timestamptz not null default now()
);

comment on table public.pedidos_totem is
  'Pedidos digitados pelo cliente no totem de autoatendimento, aguardando um caixa abrir e cobrar. Populada só pelo script automation/pdv-sync/push-to-pdv.ts do totem-loja — não tem rota de criação neste backend.';
comment on column public.pedidos_totem.totem_order_id is
  'orders.id da tabela do totem-loja — usado por automation/pdv-sync/pull-from-pdv.ts para fechar o pedido de volta lá.';

alter table public.orders
  add column if not exists totem_order_number text;

comment on column public.orders.totem_order_number is
  'Preenchido quando a venda veio de um pedido do totem (ver pedidos_totem) — é por este campo que o totem-loja sabe que foi pago.';
```

- [ ] **Step 2: Aplicar no Supabase do PDV**

```bash
ssh xulio@192.168.100.128
cd ~/apps/pdv-gm
grep SUPABASE_URL server/.env   # confirmar qual projeto — aplicar no Studio dele
```

Colar o SQL no SQL Editor do Studio desse projeto. Confirmar:

```sql
select 1 from information_schema.tables where table_name = 'pedidos_totem';
select column_name from information_schema.columns where table_name = 'orders' and column_name = 'totem_order_number';
```

Esperado: 1 linha em cada.

- [ ] **Step 3: Commit**

```bash
cd ~/apps/pdv-gm
git add server/supabase/migrations/0020_pedidos_totem.sql
git commit -m "feat: tabela pedidos_totem e coluna orders.totem_order_number"
```

---

## Task 3: PDV backend — `totemOrderService.ts`

**Files:**
- Create: `~/apps/pdv-gm/server/src/orders/totemOrderService.ts`
- Test: `~/apps/pdv-gm/server/src/orders/totemOrderService.test.ts`

- [ ] **Step 1: Escrever o teste (mock do Supabase, mesmo padrão de `preOrderService.test.ts` se existir — senão, mock manual)**

```typescript
// server/src/orders/totemOrderService.test.ts
import { describe, it, expect, vi } from "vitest";
import { listTotemOrders, deleteTotemOrder } from "./totemOrderService.js";

function makeSupabaseMock(rows: unknown[]) {
  const order = vi.fn().mockResolvedValue({ data: rows, error: null });
  const select = vi.fn().mockReturnValue({ order });
  const from = vi.fn().mockReturnValue({ select });
  return { from } as any;
}

describe("listTotemOrders", () => {
  it("converte as linhas do banco para PedidoTotem", async () => {
    const supabase = makeSupabaseMock([
      {
        id: "p1",
        totem_order_id: "t1",
        totem_order_number: "GM-20260903-000001",
        customer_name: "Fulano",
        customer_phone: null,
        price_table: "002",
        cigam_cliente_codigo: null,
        observacao: null,
        items_json: [{ cigamCode: "002001000008", productName: "Alho", unit: "UN", quantity: 1, unitPrice: 12 }],
        created_at: "2026-09-03T10:00:00Z"
      }
    ]);

    const result = await listTotemOrders(supabase);

    expect(result).toEqual([
      {
        id: "p1",
        totemOrderId: "t1",
        totemOrderNumber: "GM-20260903-000001",
        customerName: "Fulano",
        customerPhone: undefined,
        priceTable: "002",
        cigamClienteCodigo: undefined,
        observacao: undefined,
        items: [{ cigamCode: "002001000008", productName: "Alho", unit: "UN", quantity: 1, unitPrice: 12 }],
        createdAt: "2026-09-03T10:00:00Z"
      }
    ]);
  });
});

describe("deleteTotemOrder", () => {
  it("retorna true quando apagou uma linha", async () => {
    const select = vi.fn().mockResolvedValue({ data: [{ id: "p1" }], error: null });
    const eq = vi.fn().mockReturnValue({ select });
    const del = vi.fn().mockReturnValue({ eq });
    const supabase = { from: vi.fn().mockReturnValue({ delete: del }) } as any;

    const result = await deleteTotemOrder(supabase, "p1");

    expect(result).toBe(true);
    expect(del).toHaveBeenCalled();
  });

  it("retorna false quando não havia o que apagar", async () => {
    const select = vi.fn().mockResolvedValue({ data: [], error: null });
    const eq = vi.fn().mockReturnValue({ select });
    const del = vi.fn().mockReturnValue({ eq });
    const supabase = { from: vi.fn().mockReturnValue({ delete: del }) } as any;

    const result = await deleteTotemOrder(supabase, "p1");

    expect(result).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha (arquivo de implementação ainda não existe)**

```bash
export NVM_DIR=$HOME/.nvm; source $NVM_DIR/nvm.sh
cd ~/apps/pdv-gm/server
npx vitest run src/orders/totemOrderService.test.ts
```
Esperado: FAIL — `Cannot find module './totemOrderService.js'`.

- [ ] **Step 3: Implementar**

```typescript
// server/src/orders/totemOrderService.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PreOrderItem } from "./preOrderService.js";

/**
 * Pedido digitado pelo cliente no totem de autoatendimento, esperando um
 * caixa abrir e cobrar. Só existe nesta tabela porque o script
 * automation/pdv-sync/push-to-pdv.ts (no repo totem-loja) escreveu — este
 * backend nunca cria linha aqui, só lista e apaga.
 */
export interface TotemOrder {
  id: string;
  totemOrderId: string;
  totemOrderNumber: string;
  customerName: string;
  customerPhone?: string;
  priceTable: string;
  cigamClienteCodigo?: string;
  observacao?: string;
  items: PreOrderItem[];
  createdAt: string;
}

function rowToTotemOrder(row: Record<string, unknown>): TotemOrder {
  return {
    id: String(row.id),
    totemOrderId: String(row.totem_order_id),
    totemOrderNumber: String(row.totem_order_number),
    customerName: String(row.customer_name),
    customerPhone: row.customer_phone ? String(row.customer_phone) : undefined,
    priceTable: String(row.price_table),
    cigamClienteCodigo: row.cigam_cliente_codigo ? String(row.cigam_cliente_codigo) : undefined,
    observacao: row.observacao ? String(row.observacao) : undefined,
    items: (row.items_json as PreOrderItem[] | null) ?? [],
    createdAt: String(row.created_at)
  };
}

/** Todos os pedidos do totem aguardando cobrança, mais recentes primeiro. */
export async function listTotemOrders(supabase: SupabaseClient): Promise<TotemOrder[]> {
  const { data, error } = await supabase
    .from("pedidos_totem")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Falha ao consultar pedidos do totem no Supabase: ${error.message}`);
  return (data ?? []).map((row) => rowToTotemOrder(row as Record<string, unknown>));
}

/**
 * Apaga um pedido do totem da fila. Mesmo comportamento de deletePreOrder:
 * false quando não havia o que apagar (outro terminal já abriu este).
 */
export async function deleteTotemOrder(supabase: SupabaseClient, id: string): Promise<boolean> {
  const { data, error } = await supabase.from("pedidos_totem").delete().eq("id", id).select("id");
  if (error) throw new Error(`Falha ao excluir o pedido do totem no Supabase: ${error.message}`);
  return (data ?? []).length > 0;
}
```

- [ ] **Step 4: Rodar de novo e confirmar que passa**

```bash
npx vitest run src/orders/totemOrderService.test.ts
```
Esperado: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
cd ~/apps/pdv-gm
git add server/src/orders/totemOrderService.ts server/src/orders/totemOrderService.test.ts
git commit -m "feat: listar e apagar pedidos do totem (pedidos_totem)"
```

---

## Task 4: PDV backend — rotas `GET/DELETE /totem-orders`

**Files:**
- Modify: `~/apps/pdv-gm/server/src/routes/api.ts` (perto das rotas `/pre-orders`, por volta da linha 1254)

- [ ] **Step 1: Adicionar o import no topo do arquivo, junto dos outros de `orders/`**

Localizar a linha que importa de `preOrderService.js` e adicionar logo abaixo:

```typescript
import { listTotemOrders, deleteTotemOrder } from "../orders/totemOrderService.js";
```

- [ ] **Step 2: Adicionar as rotas, logo depois do bloco `/pre-orders` (antes de `router.post("/orders", ...)`)**

```typescript
  router.get("/totem-orders", async (_req, res, next) => {
    try {
      res.json(await listTotemOrders(supabase));
    } catch (err) {
      next(err);
    }
  });

  // Mesma semântica de DELETE /pre-orders/:id: 204 mesmo quando já não
  // havia nada para apagar — outro terminal pode ter aberto este pedido
  // primeiro.
  router.delete("/totem-orders/:id", async (req, res, next) => {
    try {
      await deleteTotemOrder(supabase, req.params.id);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });
```

- [ ] **Step 3: Smoke test manual (sem pedido nenhum ainda, só confirmar que a rota responde)**

```bash
export NVM_DIR=$HOME/.nvm; source $NVM_DIR/nvm.sh
cd ~/apps/pdv-gm
pm2 restart pdv-backend
sleep 2
curl -s http://127.0.0.1:4000/api/totem-orders
```
Esperado: `{"message":"Sessão inválida ou expirada..."}` (a rota existe e está atrás do mesmo middleware de auth de tudo mais — é o mesmo 401-como-mensagem que `/cigam/materiais` devolveu no Task de investigação; confirma que a rota está registrada, não confirma o conteúdo ainda).

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/api.ts
git commit -m "feat: rotas GET/DELETE /totem-orders"
```

---

## Task 5: PDV backend — `totemOrderNumber` na venda normal

**Files:**
- Modify: `~/apps/pdv-gm/server/src/orders/orderService.ts` (interface `NewOrderInput`, por volta da linha 69-103; e o insert em `reserveOrder`, por volta da linha 340-350)
- Modify: `~/apps/pdv-gm/server/src/routes/orderValidation.ts`

- [ ] **Step 1: Campo novo na interface**

Em `orderService.ts`, dentro de `NewOrderInput` (logo depois do campo `observacao?: string;`, por volta da linha 98):

```typescript
  // Preenchido só quando esta venda nasceu de um pedido do totem
  // (ver server/src/orders/totemOrderService.ts) — grava a referência para
  // o script automation/pdv-sync/pull-from-pdv.ts do totem-loja fechar o
  // pedido de lá como pago. Nulo em toda venda normal de balcão.
  totemOrderNumber?: string;
```

- [ ] **Step 2: Gravar no insert**

Localizar o insert que já grava `observacao: input.observacao ?? null,` (por volta da linha 350) e adicionar ao lado:

```typescript
      observacao: input.observacao ?? null,
      totem_order_number: input.totemOrderNumber ?? null,
```

- [ ] **Step 3: Aceitar no validador**

Em `orderValidation.ts`, localizar onde `observacao` é lido do corpo da requisição (mesmo padrão — string opcional, sem validação de negócio, só passa adiante) e adicionar ao lado:

```typescript
  const totemOrderNumber =
    typeof body.totemOrderNumber === "string" && body.totemOrderNumber.trim()
      ? body.totemOrderNumber.trim()
      : undefined;
```

E incluir `totemOrderNumber` no objeto `data` retornado pela validação (ao lado de onde `observacao` já é incluído).

- [ ] **Step 4: Teste — pedido com `totemOrderNumber` grava a coluna**

Achar o teste existente de `reserveOrder`/`createOrder` que já verifica o insert de `observacao` (deve haver um em `server/src/orders/orderService.test.ts` ou similar) e adicionar um caso ao lado, mesmo estilo:

```typescript
  it("grava totem_order_number quando presente no input", async () => {
    const input = { ...baseInput, totemOrderNumber: "GM-20260903-000001" };
    // ... mesma montagem de supabase mock do teste de observacao vizinho,
    // trocando a asserção para checar que o insert recebeu
    // totem_order_number: "GM-20260903-000001"
  });
```

*(Nota para quem executa: usar exatamente o mock/fixture do teste de `observacao` já existente no arquivo — não recriar do zero. Se esse teste não existir, escrever um novo que monta um `NewOrderInput` mínimo válido, chama `reserveOrder`, e verifica a chamada `.insert(...)` recebida pelo mock do Supabase.)*

- [ ] **Step 5: Rodar os testes do orderService e confirmar que passam**

```bash
cd ~/apps/pdv-gm/server
npx vitest run src/orders/orderService.test.ts
```

- [ ] **Step 6: Commit**

```bash
cd ~/apps/pdv-gm
git add server/src/orders/orderService.ts server/src/routes/orderValidation.ts server/src/orders/orderService.test.ts
git commit -m "feat: gravar totem_order_number na venda quando a origem é o totem"
```

---

## Task 6: PDV frontend — API client (`fetchTotemOrders`, `deleteTotemOrder`)

**Files:**
- Modify: `~/apps/pdv-gm/src/lib/api.ts`

- [ ] **Step 1: Adicionar o tipo e as funções logo depois de `deletePreOrder` (por volta da linha 399)**

```typescript
export interface TotemOrder {
  id: string;
  totemOrderId: string;
  totemOrderNumber: string;
  customerName: string;
  customerPhone?: string;
  priceTable: string;
  cigamClienteCodigo?: string;
  observacao?: string;
  items: CheckoutItem[];
  createdAt: string;
}

export async function fetchTotemOrders(): Promise<TotemOrder[]> {
  const res = await fetchWithTimeout(`${BASE_URL}/totem-orders`, { headers: authHeaders() });
  notifyIfUnauthorized(res);
  if (!res.ok) throw new Error("Falha ao consultar os pedidos do totem");
  return res.json();
}

export async function deleteTotemOrder(id: string): Promise<void> {
  const res = await fetchWithTimeout(`${BASE_URL}/totem-orders/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: authHeaders()
  });
  notifyIfUnauthorized(res);
  if (!res.ok) throw new Error("Falha ao excluir o pedido do totem");
}
```

- [ ] **Step 2: Incluir `totemOrderNumber` no payload de `createOrder`**

Localizar a função `createOrder` (a que faz `POST /orders`) e, no objeto do body, ao lado de onde `observacao` já é enviado, adicionar:

```typescript
    totemOrderNumber: input.totemOrderNumber,
```

E no tipo do parâmetro de `createOrder`, ao lado de `observacao?: string;`, adicionar `totemOrderNumber?: string;`.

- [ ] **Step 3: Commit**

```bash
cd ~/apps/pdv-gm
git add src/lib/api.ts
git commit -m "feat: client de pedidos do totem e passthrough de totemOrderNumber"
```

---

## Task 7: PDV frontend — `SaleContext` carrega `totemOrderNumber`, tela `PedidosTotem.tsx`, botão no Home

**Files:**
- Modify: `~/apps/pdv-gm/src/contexts/CartContext.tsx`
- Create: `~/apps/pdv-gm/src/pages/PedidosTotem.tsx`
- Test: `~/apps/pdv-gm/src/pages/PedidosTotem.test.tsx`
- Modify: `~/apps/pdv-gm/src/pages/Home.tsx`
- Modify: arquivo de rotas (localizar com `grep -rn "PedidosPreDigitados" ~/apps/pdv-gm/src --include=*.tsx` — deve apontar pro arquivo de rotas, além do próprio Home)

- [ ] **Step 1: `SaleContext` — adicionar o campo (por volta da linha 52, ao lado de `observacao?: string;`)**

```typescript
  totemOrderNumber?: string;
```

`carregarPedido` já recebe `sale: Omit<SaleContext, "payments">` genérico — nenhuma mudança de assinatura necessária, só o tipo ganha o campo novo.

- [ ] **Step 2: Confirmar que o payload de `createOrder` (Task 6) já lê esse campo do `SaleContext` no momento do checkout**

Localizar onde `Pagamento.tsx` (ou o hook que finaliza a venda) monta o objeto passado para `createOrder` a partir do `SaleContext` atual — confirmar que ele espalha o objeto inteiro (`...sale`) ou lista campos nominalmente. Se listar nominalmente, adicionar `totemOrderNumber: sale.totemOrderNumber` ao lado de `observacao: sale.observacao`.

- [ ] **Step 3: Escrever o teste da tela nova (mesmo padrão de `PedidosPreDigitados.test.tsx` — copiar a estrutura de lá trocando os mocks de `fetchPreOrders`/`deletePreOrder` por `fetchTotemOrders`/`deleteTotemOrder`)**

```bash
cat ~/apps/pdv-gm/src/pages/PedidosPreDigitados.test.tsx
```

Usar esse arquivo como molde 1:1 para `PedidosTotem.test.tsx`: mesmos casos (lista vazia, lista com item, abrir carrega no carrinho e some da lista, descartar pede confirmação) — só trocando os nomes de função mockada e o texto exibido.

- [ ] **Step 4: Rodar e confirmar que falha**

```bash
cd ~/apps/pdv-gm
npx vitest run src/pages/PedidosTotem.test.tsx
```
Esperado: FAIL — módulo `../pages/PedidosTotem.js` não existe.

- [ ] **Step 5: Implementar `PedidosTotem.tsx`**

Copiar `PedidosPreDigitados.tsx` (conteúdo completo já lido nesta pesquisa) trocando:
- import de `fetchPreOrders, deletePreOrder, type PreOrder` → `fetchTotemOrders, deleteTotemOrder, type TotemOrder`
- toda ocorrência de `pedido.cashierName`/"Adiantado por ..." — REMOVER (pedido do totem não tem operador que adiantou; trocar o `<span className="pre-order-meta">` para mostrar só o horário e, se houver, "· Cliente cadastrado")
- `pedido.id` no `carregarPedido` sale continua vindo de `pedido.id` (o pré-order local), mas agora inclui `totemOrderNumber: pedido.totemOrderNumber` no objeto `sale`
- texto do cabeçalho: "Pedidos pré-digitados" → "Pedidos do totem"
- mensagem de lista vazia: trocar para "Nenhum pedido do totem no momento. Assim que um cliente finalizar o pedido no totem de autoatendimento, ele aparece aqui."
- `ehParceiro` sempre `false` (pedido de totem nunca é venda de parceiro — remover esse cálculo e a navegação condicional; sempre `navigate(pedido.cigamClienteCodigo ? "/carrinho-cliente" : "/carrinho")`)

```typescript
// src/pages/PedidosTotem.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCashier } from "../contexts/CashierContext.js";
import { useCart } from "../contexts/CartContext.js";
import { fetchTotemOrders, deleteTotemOrder, type TotemOrder } from "../lib/api.js";
import { cartTotal, formatBRL } from "../lib/money.js";
import { resumirCarrinho, formatKg, formatQtd } from "../lib/cartResumo.js";
import BackButton from "../components/BackButton.js";

/**
 * Pedidos que o cliente digitou sozinho no totem de autoatendimento e ainda
 * não pagou. Espelha PedidosPreDigitados.tsx (mesmo mecanismo de "abrir
 * substitui o carrinho atual"), mas é uma fila separada porque a origem é
 * diferente: aqui ninguém do caixa adiantou nada.
 */
export default function PedidosTotem() {
  const { cashier } = useCashier();
  const { carregarPedido, hasDraft } = useCart();
  const navigate = useNavigate();

  const [pedidos, setPedidos] = useState<TotemOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [confirmandoDescarte, setConfirmandoDescarte] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  function recarregar() {
    fetchTotemOrders()
      .then(setPedidos)
      .catch((err) => setError(err instanceof Error ? err.message : "Falha ao consultar os pedidos do totem"));
  }

  useEffect(recarregar, []);

  if (!cashier) {
    return null;
  }

  async function handleAbrir(pedido: TotemOrder) {
    if (hasDraft && aviso !== pedido.id) {
      setAviso(pedido.id);
      return;
    }

    setOcupado(pedido.id);
    setError(null);
    try {
      await deleteTotemOrder(pedido.id);
      carregarPedido({
        sale: {
          customerName: pedido.customerName,
          customerPhone: pedido.customerPhone,
          priceTable: pedido.priceTable as "002" | "003" | "004" | "005",
          clienteCodigo: pedido.cigamClienteCodigo,
          observacao: pedido.observacao,
          totemOrderNumber: pedido.totemOrderNumber
        },
        items: pedido.items
      });
      navigate(pedido.cigamClienteCodigo ? "/carrinho-cliente" : "/carrinho");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao abrir o pedido do totem");
      setOcupado(null);
    }
  }

  async function handleDescartar(pedido: TotemOrder) {
    setOcupado(pedido.id);
    setError(null);
    try {
      await deleteTotemOrder(pedido.id);
      setPedidos((prev) => (prev ?? []).filter((p) => p.id !== pedido.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao excluir o pedido do totem");
    } finally {
      setOcupado(null);
      setConfirmandoDescarte(null);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">GM</div>
          <div className="brand-text">
            <span className="eyebrow">Atendimento</span>
            <span className="name">Pedidos do totem</span>
          </div>
        </div>
        <div className="topbar-meta">
          <span>
            Operador: <strong>{cashier.name}</strong>
          </span>
          <BackButton onClick={() => navigate("/home")} />
        </div>
      </header>

      <main className="app-main">
        <div className="content-wide">
          {error && (
            <div className="panel">
              <p role="alert" className="banner-error">
                {error}
              </p>
            </div>
          )}

          {pedidos === null && !error && (
            <div className="panel">
              <p className="status-message">Carregando...</p>
            </div>
          )}

          {pedidos !== null && pedidos.length === 0 && (
            <div className="panel">
              <p className="empty-hint">
                Nenhum pedido do totem no momento. Assim que um cliente finalizar o pedido no totem de
                autoatendimento, ele aparece aqui.
              </p>
            </div>
          )}

          {pedidos !== null && pedidos.length > 0 && (
            <ul className="pre-order-list">
              {pedidos.map((pedido) => {
                const resumo = resumirCarrinho(pedido.items);
                const total = cartTotal(pedido.items);
                return (
                  <li key={pedido.id} className="panel pre-order-card">
                    <div className="pre-order-card-head">
                      <div>
                        <span className="pre-order-cliente">{pedido.customerName}</span>
                        <span className="pre-order-meta">
                          Pedido {pedido.totemOrderNumber} ·{" "}
                          {new Date(pedido.createdAt).toLocaleTimeString("pt-BR", {
                            hour: "2-digit",
                            minute: "2-digit"
                          })}
                        </span>
                      </div>
                      <span className="pre-order-total">{formatBRL(total)}</span>
                    </div>

                    <p className="pre-order-itens">
                      {formatQtd(resumo.totalItens)} {resumo.totalItens === 1 ? "item" : "itens"}
                      {resumo.totalKg > 0 && ` · ${formatKg(resumo.totalKg)}`}
                      {" — "}
                      {pedido.items.map((i) => i.productName).join(", ")}
                    </p>

                    {aviso === pedido.id && (
                      <p className="banner-warning">
                        Você tem um pedido em andamento no carrinho. Abrir este vai substituí-lo. Clique em "Abrir
                        pedido" de novo para confirmar.
                      </p>
                    )}

                    {confirmandoDescarte === pedido.id ? (
                      <div className="actions">
                        <button
                          type="button"
                          className="btn-secondary"
                          disabled={ocupado === pedido.id}
                          onClick={() => setConfirmandoDescarte(null)}
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          className="btn-primary"
                          disabled={ocupado === pedido.id}
                          onClick={() => handleDescartar(pedido)}
                        >
                          {ocupado === pedido.id ? "Excluindo…" : "Sim, descartar"}
                        </button>
                      </div>
                    ) : (
                      <div className="actions">
                        <button
                          type="button"
                          className="btn-primary"
                          disabled={ocupado === pedido.id}
                          onClick={() => handleAbrir(pedido)}
                        >
                          {ocupado === pedido.id ? "Abrindo…" : "Abrir pedido"}
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          disabled={ocupado === pedido.id}
                          onClick={() => setConfirmandoDescarte(pedido.id)}
                        >
                          Descartar
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 6: Rodar e confirmar que passa**

```bash
npx vitest run src/pages/PedidosTotem.test.tsx
```

- [ ] **Step 7: Botão no Home**

```bash
grep -n "Pedidos pré-digitados\|pre-orders\|PedidosPreDigitados" ~/apps/pdv-gm/src/pages/Home.tsx
```

Adicionar um botão irmão do de "Pedidos pré-digitados" (mesmo componente/estilo), rotulado "Totem", navegando para `/pedidos-totem`.

- [ ] **Step 8: Rota nova**

```bash
grep -rn "pedidos-pre-digitados\|PedidosPreDigitados" ~/apps/pdv-gm/src/App.tsx
```

Adicionar, ao lado da rota existente:

```typescript
<Route path="/pedidos-totem" element={<RequireAuth><RequireOpenCashSession><PedidosTotem /></RequireOpenCashSession></RequireAuth>} />
```

(usar exatamente os mesmos wrappers que a rota de pré-digitados usa — copiar dali, não adivinhar).

- [ ] **Step 9: Commit**

```bash
cd ~/apps/pdv-gm
git add src/contexts/CartContext.tsx src/pages/PedidosTotem.tsx src/pages/PedidosTotem.test.tsx src/pages/Home.tsx src/App.tsx
git commit -m "feat: tela Pedidos do Totem no PDV"
```

---

## Task 8: PDV frontend — aviso de pedido novo do totem

**Files:**
- Create: `~/apps/pdv-gm/src/components/AvisoPedidoTotem.tsx`
- Test: `~/apps/pdv-gm/src/components/AvisoPedidoTotem.test.tsx`
- Modify: `~/apps/pdv-gm/src/App.tsx`

Sem isto, um pedido do totem só aparece pra quem lembrar de abrir a aba "Totem" por conta própria. O pedido do usuário: **sempre que rolar um pedido no totem, tem que rolar uma notificação popup no canto da tela avisando, pra elas chamarem o cliente pelo nome vir até elas revisar e pagar.**

- [ ] **Step 1: Escrever o teste**

Mirar em `src/pages/Fechamento.test.tsx` para o padrão de login em teste (`CashierProvider` real + `global.fetch` mockado para `/auth/login` — NÃO existe `api.login` exportado, o `CashierProvider` chama `fetch` direto):

```bash
sed -n "1,70p" ~/apps/pdv-gm/src/pages/Fechamento.test.tsx
```

```typescript
// src/components/AvisoPedidoTotem.test.tsx
import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useEffect, useRef } from "react";
import { MemoryRouter } from "react-router-dom";
import { CashierProvider, useCashier } from "../contexts/CashierContext.js";
import * as api from "../lib/api.js";
import AvisoPedidoTotem from "./AvisoPedidoTotem.js";

function Seed() {
  const { login, cashier } = useCashier();
  const loggingIn = useRef(false);
  useEffect(() => {
    if (loggingIn.current || cashier) return;
    loggingIn.current = true;
    void login("caixa1", "123456");
  }, [login, cashier]);
  return null;
}

function renderComCaixaLogado() {
  return render(
    <MemoryRouter>
      <CashierProvider>
        <Seed />
        <AvisoPedidoTotem />
      </CashierProvider>
    </MemoryRouter>
  );
}

const PEDIDO_FULANO = {
  id: "p1",
  totemOrderId: "t1",
  totemOrderNumber: "GM-1",
  customerName: "Fulano",
  priceTable: "002",
  items: [],
  createdAt: "2026-09-03T10:00:00Z"
} as unknown as api.TotemOrder;

describe("AvisoPedidoTotem", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "cashier-1", username: "caixa1", name: "Maria" })
    }) as unknown as typeof fetch;
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("não mostra aviso para pedidos que já estavam na fila na primeira consulta", async () => {
    vi.spyOn(api, "fetchTotemOrders").mockResolvedValue([PEDIDO_FULANO]);
    renderComCaixaLogado();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.queryByText(/Fulano/)).not.toBeInTheDocument();
  });

  it("mostra aviso quando um pedido novo aparece numa consulta seguinte", async () => {
    const spy = vi.spyOn(api, "fetchTotemOrders");
    spy.mockResolvedValueOnce([]);
    spy.mockResolvedValueOnce([PEDIDO_FULANO]);

    renderComCaixaLogado();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(15_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText(/Fulano/)).toBeInTheDocument();
  });

  it("some o aviso quando o caixa clica em Dispensar", async () => {
    const spy = vi.spyOn(api, "fetchTotemOrders");
    spy.mockResolvedValueOnce([]);
    spy.mockResolvedValueOnce([PEDIDO_FULANO]);

    renderComCaixaLogado();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(15_000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText(/Fulano/)).toBeInTheDocument();

    screen.getByText("Dispensar").click();

    expect(screen.queryByText(/Fulano/)).not.toBeInTheDocument();
  });

  it("some o aviso quando o pedido some da fila (outro caixa já abriu)", async () => {
    const spy = vi.spyOn(api, "fetchTotemOrders");
    spy.mockResolvedValueOnce([]);
    spy.mockResolvedValueOnce([PEDIDO_FULANO]);
    spy.mockResolvedValueOnce([]);

    renderComCaixaLogado();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(15_000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText(/Fulano/)).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(15_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.queryByText(/Fulano/)).not.toBeInTheDocument();
  });
});
```

*(Nota para quem executa: conferir a resposta exata que `CashierProvider` espera de `POST /auth/login` — o mock acima usa `{id, username, name}` copiado de `Fechamento.test.tsx`; se `CashierContext.tsx` esperar um formato diferente, ajustar o mock, não a lógica de `AvisoPedidoTotem`.)*

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
cd ~/apps/pdv-gm
npx vitest run src/components/AvisoPedidoTotem.test.tsx
```
Esperado: FAIL — módulo `./AvisoPedidoTotem.js` não existe.

- [ ] **Step 3: Implementar**

```typescript
// src/components/AvisoPedidoTotem.tsx
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCashier } from "../contexts/CashierContext.js";
import { fetchTotemOrders, type TotemOrder } from "../lib/api.js";

/**
 * Avisa em qualquer tela do PDV quando um pedido novo chega do totem de
 * autoatendimento — o caixa precisa saber para chamar o cliente pelo nome
 * vir ao balcão revisar e pagar. Sem isto, o pedido só aparece se alguém
 * lembrar de abrir a aba "Totem" por conta própria.
 *
 * Um card por pedido novo, empilhado no canto — ao contrário de
 * AvisoFecharCaixa, não é modal bloqueante: não faz sentido travar o caixa
 * no meio do atendimento de quem já está na frente dele.
 */
const POLL_MS = 15_000;

export default function AvisoPedidoTotem() {
  const { cashier } = useCashier();
  const navigate = useNavigate();
  const [avisos, setAvisos] = useState<TotemOrder[]>([]);
  const conhecidosRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!cashier) return;

    let cancelado = false;

    async function conferir() {
      try {
        const pedidos = await fetchTotemOrders();
        if (cancelado) return;

        // Primeira consulta desta aba vira a linha de base: sem isto, todo
        // pedido já parado na fila viraria "aviso novo" assim que o caixa
        // loga — correto na abertura do terminal, mas repetiria a cada F5.
        if (conhecidosRef.current === null) {
          conhecidosRef.current = new Set(pedidos.map((p) => p.id));
          return;
        }

        const idsAtuais = new Set(pedidos.map((p) => p.id));
        const novos = pedidos.filter((p) => !conhecidosRef.current!.has(p.id));
        novos.forEach((p) => conhecidosRef.current!.add(p.id));

        setAvisos((prev) => {
          // Um pedido que já foi aberto por algum caixa some da fila —
          // some do aviso também: não faz sentido continuar chamando um
          // cliente que já está sendo atendido em outro terminal.
          const semFechados = prev.filter((a) => idsAtuais.has(a.id));
          return novos.length > 0 ? [...semFechados, ...novos] : semFechados;
        });
      } catch {
        // Falha de rede aqui não é motivo para incomodar o caixa com um
        // erro visível — a próxima consulta em 15s tenta de novo.
      }
    }

    conferir();
    const id = setInterval(conferir, POLL_MS);
    return () => {
      cancelado = true;
      clearInterval(id);
    };
  }, [cashier]);

  function dispensar(id: string) {
    setAvisos((prev) => prev.filter((a) => a.id !== id));
  }

  function irParaPedido(id: string) {
    dispensar(id);
    navigate("/pedidos-totem");
  }

  if (avisos.length === 0) return null;

  return (
    <div className="aviso-pedido-totem-stack" role="region" aria-label="Pedidos novos do totem">
      {avisos.map((pedido) => (
        <div key={pedido.id} className="panel aviso-pedido-totem-card" role="alert">
          <span className="aviso-pedido-totem-icone" aria-hidden="true">
            🔔
          </span>
          <div className="aviso-pedido-totem-texto">
            <strong>Pedido do totem</strong>
            <span>Chame {pedido.customerName} para revisar e pagar.</span>
          </div>
          <div className="actions">
            <button type="button" className="btn-primary" onClick={() => irParaPedido(pedido.id)}>
              Ver pedido
            </button>
            <button type="button" className="btn-secondary" onClick={() => dispensar(pedido.id)}>
              Dispensar
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: CSS — posicionar a pilha no canto**

```bash
grep -rln "\.modal-overlay\s*{" ~/apps/pdv-gm/src --include=*.css
```

No arquivo encontrado, adicionar (mesma convenção visual de `.panel`/`.btn-primary` já usada — não recriar cores/fontes do zero, só o posicionamento):

```css
.aviso-pedido-totem-stack {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 340px;
}

.aviso-pedido-totem-card {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
}

.aviso-pedido-totem-icone {
  font-size: 1.3rem;
}

.aviso-pedido-totem-texto {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
```

- [ ] **Step 5: Rodar e confirmar que os testes passam**

```bash
npx vitest run src/components/AvisoPedidoTotem.test.tsx
```
Esperado: PASS (4 testes).

- [ ] **Step 6: Montar globalmente**

```bash
grep -n "AvisoFecharCaixa" ~/apps/pdv-gm/src/App.tsx
```

Adicionar o import e a tag ao lado de `<AvisoFecharCaixa />` (linha ~190 do levantamento):

```typescript
import AvisoPedidoTotem from "./components/AvisoPedidoTotem.js";
```

```typescript
            <AvisoFecharCaixa />
            <AvisoPedidoTotem />
```

- [ ] **Step 7: Commit**

```bash
cd ~/apps/pdv-gm
git add src/components/AvisoPedidoTotem.tsx src/components/AvisoPedidoTotem.test.tsx src/App.tsx
git commit -m "feat: aviso no canto da tela quando chega pedido novo do totem"
```

---

## Task 9: totem-loja — script `push-to-pdv.ts`

**Files:**
- Create: `~/apps/totem-loja/automation/pdv-sync/push-to-pdv.ts`
- Test: `~/apps/totem-loja/automation/pdv-sync/push-to-pdv.test.ts`

- [ ] **Step 1: Teste**

```typescript
// automation/pdv-sync/push-to-pdv.test.ts
import { describe, it, expect, vi } from "vitest";
import { buildTotemOrderPayload } from "./push-to-pdv";

describe("buildTotemOrderPayload", () => {
  it("monta os itens em unidade (não KG) direto, sem conversão", () => {
    const order = {
      id: "totem-uuid-1",
      order_number: "GM-20260903-000001",
      customer_name: "Fulano da Silva",
      customer_document: "11122233344",
      order_items: [
        {
          product_name: "Alho Em Creme Tradicional OMG Pote – 200g",
          quantity: 2,
          unit_price_cents: 1200,
          products: { cigam_code: "002001000008", cigam_unit: "UN", weight: 0.2 }
        }
      ]
    };

    const payload = buildTotemOrderPayload(order as any);

    expect(payload.totem_order_id).toBe("totem-uuid-1");
    expect(payload.totem_order_number).toBe("GM-20260903-000001");
    expect(payload.customer_name).toBe("Fulano da Silva");
    expect(payload.price_table).toBe("002");
    expect(payload.items_json).toEqual([
      {
        cigamCode: "002001000008",
        productName: "Alho Em Creme Tradicional OMG Pote – 200g",
        unit: "UN",
        quantity: 2,
        unitPrice: 12
      }
    ]);
  });

  it("marca packageWeightKg para item vendido por KG", () => {
    const order = {
      id: "totem-uuid-2",
      order_number: "GM-20260903-000002",
      customer_name: "Ciclana",
      customer_document: "22233344455",
      order_items: [
        {
          product_name: "Pão de Queijo Forno Quente 25g – Pacote 800g",
          quantity: 1,
          unit_price_cents: 1500,
          products: { cigam_code: "002005000004", cigam_unit: "KG", weight: 0.8 }
        }
      ]
    };

    const payload = buildTotemOrderPayload(order as any);

    expect(payload.items_json).toEqual([
      {
        cigamCode: "002005000004",
        productName: "Pão de Queijo Forno Quente 25g – Pacote 800g",
        unit: "KG",
        quantity: 1,
        unitPrice: 15,
        packageWeightKg: 0.8
      }
    ]);
  });

  it("lança erro se algum item não tem cigam_code", () => {
    const order = {
      id: "totem-uuid-3",
      order_number: "GM-20260903-000003",
      customer_name: "Beltrano",
      customer_document: "33344455566",
      order_items: [
        { product_name: "Produto sem código", quantity: 1, unit_price_cents: 500, products: { cigam_code: null, cigam_unit: "UN", weight: null } }
      ]
    };

    expect(() => buildTotemOrderPayload(order as any)).toThrow(/sem código CIGAM/);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
export NVM_DIR=$HOME/.nvm; source $NVM_DIR/nvm.sh
export PATH=/home/xulio/.nvm/versions/node/v25.8.1/bin:$PATH
cd ~/apps/totem-loja
npx vitest run automation/pdv-sync/push-to-pdv.test.ts
```
Esperado: FAIL — módulo `./push-to-pdv` não existe.

- [ ] **Step 3: Implementar**

```typescript
// automation/pdv-sync/push-to-pdv.ts
/**
 * Empurra pedidos novos do totem para a fila de caixa do PDV
 * (tabela pedidos_totem, Supabase do pdv-gm) — substitui o antigo
 * automation/cigam/process-pending-orders.ts: o totem não fala mais com o
 * CIGAM, quem faz isso agora é o PDV no momento em que o caixa cobra.
 *
 * Conversão de quantidade/preço: NENHUMA é feita aqui — vai o preço de
 * pacote (unitPrice) e, só para material KG, o peso do pacote
 * (packageWeightKg). É o orderService.ts do PDV (cigamQuantity/lineTotal)
 * quem converte para R$/kg e kg totais na hora de montar o pedido no CIGAM
 * — mesma fórmula que o antigo cliente CIGAM do totem já usava
 * (ver automation/cigam/process-pending-orders.ts:buildItens, aposentado).
 */
import { createClient, SupabaseClient } from "@supabase/supabase-js";

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
  customer_document: string | null;
  order_items: ItemRow[];
};

export type PedidoTotemPayload = {
  totem_order_id: string;
  totem_order_number: string;
  customer_name: string;
  customer_phone: null;
  price_table: "002";
  cigam_cliente_codigo: null;
  observacao: null;
  items_json: Array<{
    cigamCode: string;
    productName: string;
    unit: string;
    quantity: number;
    unitPrice: number;
    packageWeightKg?: number;
  }>;
};

/**
 * priceTable fixo em "002" (varejo/consumidor): o totem só vende no varejo
 * hoje — se um dia vender atacado, decidir aqui teria que olhar
 * order.payment_method como o antigo resolveChannel fazia.
 */
export function buildTotemOrderPayload(order: OrderRow): PedidoTotemPayload {
  const items = order.order_items.map((item) => {
    const produto = item.products;
    if (!produto?.cigam_code) {
      throw new Error(`Produto sem código CIGAM: ${item.product_name}`);
    }
    const unidade = (produto.cigam_unit ?? "UN").trim().toUpperCase();
    const porKg = unidade === "KG";
    const peso = Number(produto.weight) > 0 ? Number(produto.weight) : undefined;

    return {
      cigamCode: produto.cigam_code,
      productName: item.product_name,
      unit: unidade,
      quantity: item.quantity,
      unitPrice: item.unit_price_cents / 100,
      ...(porKg && peso ? { packageWeightKg: peso } : {})
    };
  });

  return {
    totem_order_id: order.id,
    totem_order_number: order.order_number,
    customer_name: order.customer_name ?? "CONSUMIDOR NAO IDENTIFICADO",
    customer_phone: null,
    price_table: "002",
    cigam_cliente_codigo: null,
    observacao: null,
    items_json: items
  };
}

export async function pushPendingOrders(
  totemSupabase: SupabaseClient,
  pdvSupabase: SupabaseClient
): Promise<{ enviados: number; erros: number }> {
  const { data: orders, error } = await totemSupabase
    .from("orders")
    .select(
      "id, order_number, customer_name, customer_document, order_items(product_name, quantity, unit_price_cents, products(cigam_code, cigam_unit, weight))"
    )
    .is("pdv_sync_status", null)
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) throw new Error(`Falha ao buscar pedidos pendentes de envio ao PDV: ${error.message}`);

  let enviados = 0;
  let erros = 0;

  for (const order of (orders ?? []) as unknown as OrderRow[]) {
    try {
      const payload = buildTotemOrderPayload(order);
      const { error: insertError } = await pdvSupabase.from("pedidos_totem").insert(payload);
      if (insertError) throw new Error(insertError.message);

      await totemSupabase
        .from("orders")
        .update({ pdv_sync_status: "SENT", pdv_synced_at: new Date().toISOString(), pdv_sync_error: null })
        .eq("id", order.id);
      enviados++;
      console.log(`✅ [pdv-push] ${order.order_number} → fila do PDV`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await totemSupabase
        .from("orders")
        .update({ pdv_sync_status: "ERROR", pdv_sync_error: message })
        .eq("id", order.id);
      erros++;
      console.error(`❌ [pdv-push] ${order.order_number}: ${message}`);
    }
  }

  return { enviados, erros };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const totemSupabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const pdvSupabase = createClient(process.env.PDV_SUPABASE_URL!, process.env.PDV_SUPABASE_SERVICE_ROLE_KEY!);
  pushPendingOrders(totemSupabase, pdvSupabase).then((r) => console.log(r));
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npx vitest run automation/pdv-sync/push-to-pdv.test.ts
```
Esperado: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add automation/pdv-sync/push-to-pdv.ts automation/pdv-sync/push-to-pdv.test.ts
git commit -m "feat: script que empurra pedidos do totem para a fila do PDV"
```

---

## Task 10: totem-loja — script `pull-from-pdv.ts`

**Files:**
- Create: `~/apps/totem-loja/automation/pdv-sync/pull-from-pdv.ts`
- Test: `~/apps/totem-loja/automation/pdv-sync/pull-from-pdv.test.ts`

- [ ] **Step 1: Teste**

```typescript
// automation/pdv-sync/pull-from-pdv.test.ts
import { describe, it, expect, vi } from "vitest";
import { reconcilePaidOrders } from "./pull-from-pdv";

function makePdvSupabaseMock(vendas: unknown[]) {
  const notIs = vi.fn().mockResolvedValue({ data: vendas, error: null });
  const not = vi.fn().mockReturnValue({ not: notIs });
  // orders.not("totem_order_number", "is", null) — encadeado
  const select = vi.fn().mockReturnValue({ not });
  const from = vi.fn().mockReturnValue({ select });
  return { from } as any;
}

describe("reconcilePaidOrders", () => {
  it("fecha no totem os pedidos que já foram vendidos no PDV", async () => {
    const pdvSupabase = makePdvSupabaseMock([
      { totem_order_number: "GM-20260903-000001", order_number: "012345", nota_fiscal: "0000998" }
    ]);

    const updateEq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq: updateEq });
    const isEq = vi.fn().mockReturnValue({ update });
    const totemSupabase = { from: vi.fn().mockReturnValue({ update: () => ({ eq: updateEq }) }) } as any;

    const result = await reconcilePaidOrders(totemSupabase, pdvSupabase);

    expect(result.fechados).toBe(1);
    expect(updateEq).toHaveBeenCalled();
  });
});
```

*(Nota para quem executa: o mock acima é intencionalmente simples — o objetivo do teste é travar o comportamento de "uma venda do PDV com `totem_order_number` preenchido fecha exatamente um pedido no totem", não a forma exata da chamada Supabase. Ajustar o encadeamento do mock conforme a implementação real do Step 3 exigir, mantendo a asserção de negócio.)*

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx vitest run automation/pdv-sync/pull-from-pdv.test.ts
```
Esperado: FAIL — módulo `./pull-from-pdv` não existe.

- [ ] **Step 3: Implementar**

```typescript
// automation/pdv-sync/pull-from-pdv.ts
/**
 * Lê do Supabase do PDV as vendas que já saíram (orders.totem_order_number
 * preenchido) e fecha o pedido correspondente no totem: paid_at, número da
 * venda do PDV e da NF. É o fechamento do ciclo aberto por push-to-pdv.ts —
 * sem isto, o painel do totem (AdminOrders/OrderMonitor) nunca saberia que
 * o cliente pagou.
 */
import { SupabaseClient } from "@supabase/supabase-js";

type VendaPdv = {
  totem_order_number: string;
  order_number: string;
  nota_fiscal: string | null;
};

export async function reconcilePaidOrders(
  totemSupabase: SupabaseClient,
  pdvSupabase: SupabaseClient
): Promise<{ fechados: number; erros: number }> {
  const { data: vendas, error } = await pdvSupabase
    .from("orders")
    .select("totem_order_number, order_number, nota_fiscal")
    .not("totem_order_number", "is", null);

  if (error) throw new Error(`Falha ao consultar vendas do PDV: ${error.message}`);

  let fechados = 0;
  let erros = 0;

  for (const venda of (vendas ?? []) as VendaPdv[]) {
    try {
      // Idempotente por natureza: um pedido já fechado (paid_at preenchido)
      // recebe o mesmo update de novo sem problema — não há efeito
      // colateral em rodar isto a cada ciclo sobre a mesma venda.
      const { error: updateError } = await totemSupabase
        .from("orders")
        .update({
          paid_at: new Date().toISOString(),
          pdv_order_number: venda.order_number,
          pdv_nota_fiscal: venda.nota_fiscal
        })
        .eq("order_number", venda.totem_order_number)
        .is("paid_at", null);

      if (updateError) throw new Error(updateError.message);
      fechados++;
    } catch (err) {
      erros++;
      console.error(`❌ [pdv-pull] ${venda.totem_order_number}: ${err instanceof Error ? err.message : err}`);
    }
  }

  return { fechados, erros };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npx vitest run automation/pdv-sync/pull-from-pdv.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add automation/pdv-sync/pull-from-pdv.ts automation/pdv-sync/pull-from-pdv.test.ts
git commit -m "feat: script que fecha no totem os pedidos ja pagos no PDV"
```

---

## Task 11: totem-loja — laço `sync-loop.ts` + pm2

**Files:**
- Create: `~/apps/totem-loja/automation/pdv-sync/sync-loop.ts`
- Modify: `~/apps/totem-loja/.env` (2 vars novas)
- Modify: `~/apps/totem-loja/ecosystem.config.cjs`

- [ ] **Step 1: Implementar o laço (mesma estrutura de `automation/cigam-sync-service.ts`, que ele substitui)**

```bash
cat ~/apps/totem-loja/automation/cigam-sync-service.ts
```

Usar como molde de estrutura (setInterval + log de início), trocando o corpo:

```typescript
// automation/pdv-sync/sync-loop.ts
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { pushPendingOrders } from "./push-to-pdv";
import { reconcilePaidOrders } from "./pull-from-pdv";

const INTERVAL_MS = Number(process.env.PDV_SYNC_INTERVAL_MS ?? 60000);

const totemSupabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const pdvSupabase = createClient(process.env.PDV_SUPABASE_URL!, process.env.PDV_SUPABASE_SERVICE_ROLE_KEY!);

async function ciclo() {
  try {
    const push = await pushPendingOrders(totemSupabase, pdvSupabase);
    const pull = await reconcilePaidOrders(totemSupabase, pdvSupabase);
    if (push.enviados || push.erros || pull.fechados || pull.erros) {
      console.log(
        `[pdv-sync] enviados=${push.enviados} erros_envio=${push.erros} fechados=${pull.fechados} erros_fechamento=${pull.erros}`
      );
    }
  } catch (err) {
    console.error("[pdv-sync] falha no ciclo:", err);
  }
}

console.log(`🧩 sync totem↔PDV rodando — intervalo de ${INTERVAL_MS}ms`);
ciclo();
setInterval(ciclo, INTERVAL_MS);
```

- [ ] **Step 2: Variáveis novas no `.env` do totem**

Pedir ao usuário (ou buscar em `~/apps/pdv-gm/server/.env`, já lido neste levantamento) a `SUPABASE_URL` e uma **service role key** do projeto Supabase do PDV — não a mesma key que o backend do PDV usa necessariamente, mas precisa ter permissão de `insert` em `pedidos_totem` e `select` em `orders`. Adicionar ao final de `~/apps/totem-loja/.env`:

```
# Sync com o PDV (ver automation/pdv-sync)
PDV_SUPABASE_URL=<mesma URL do server/.env do pdv-gm>
PDV_SUPABASE_SERVICE_ROLE_KEY=<service role key do projeto Supabase do pdv-gm>
PDV_SYNC_INTERVAL_MS=60000
```

- [ ] **Step 3: `ecosystem.config.cjs` — trocar `totem-loja-cigam` por `totem-pdv-sync`**

```bash
grep -n -B2 -A8 "totem-loja-cigam" ~/apps/totem-loja/ecosystem.config.cjs
```

Substituir esse bloco inteiro por:

```javascript
    {
      name: "totem-pdv-sync",
      cwd: "/home/xulio/apps/totem-loja",
      script: "/home/xulio/.nvm/versions/node/v25.8.1/bin/node",
      args: ["--import", "tsx", "automation/pdv-sync/sync-loop.ts"],
    },
```

- [ ] **Step 4: Commit**

```bash
git add automation/pdv-sync/sync-loop.ts ecosystem.config.cjs
git commit -m "feat: laco de sync totem-PDV (substitui totem-loja-cigam)"
```

*(`.env` não entra no commit — é gitignored, conferir com `git status` antes de dar `git add`.)*

---

## Task 12: Aposentar `totem-loja-cigam`, subir `totem-pdv-sync`

**Files:** nenhum arquivo novo — operação no pm2.

- [ ] **Step 1: Parar e remover o processo antigo**

```bash
export NVM_DIR=$HOME/.nvm; source $NVM_DIR/nvm.sh
pm2 delete totem-loja-cigam
```

- [ ] **Step 2: Subir o novo**

```bash
cd ~/apps/totem-loja
pm2 start ecosystem.config.cjs --only totem-pdv-sync
sleep 2
pm2 logs totem-pdv-sync --lines 20 --nostream
```

Esperado: `🧩 sync totem↔PDV rodando — intervalo de 60000ms`, sem erro (fila vazia se não houver pedido pendente).

- [ ] **Step 3: `pm2 save` para persistir a lista entre reboots do servidor**

```bash
pm2 save
```

---

## Task 13: Teste ponta a ponta manual

Sem código novo — validação do fluxo inteiro antes de considerar pronto.

- [ ] **Step 1:** Criar um pedido de teste diretamente no Supabase do totem (mesmo padrão usado antes nesta sessão: insert em `orders` + `order_items` com um produto que já tem `cigam_code`, ex. um Alho em Creme), SEM setar `pdv_sync_status` (deixar null, que é a condição que `push-to-pdv.ts` procura).

- [ ] **Step 2:** Esperar até 60s (intervalo do `totem-pdv-sync`) e conferir:
```bash
pm2 logs totem-pdv-sync --lines 10 --nostream
```
Esperado: linha `✅ [pdv-push] GM-... → fila do PDV`.

- [ ] **Step 3:** Confirmar no Supabase do PDV que a linha existe em `pedidos_totem`, e no totem que `orders.pdv_sync_status = 'SENT'`.

- [ ] **Step 4:** Logar no PDV como caixa (terminal de teste, fora do horário de pico), abrir a aba "Totem" nova, confirmar que o pedido aparece, abrir, revisar o carrinho carregado, finalizar a venda com um pagamento de teste — **usar o mesmo cuidado desta sessão: confirmar que não vai emitir NF real de teste sem avisar ninguém, ou fazer isso de propósito sabendo que vai gerar uma NF de verdade** (diferente do totem sozinho, o PDV SEMPRE efetiva de verdade — não existe modo dry-run no fluxo de venda normal dele).

- [ ] **Step 5:** Depois da venda, conferir em até 60s que o pedido some da aba "Totem" (já sumiu no passo 4, na hora de abrir) e que o pedido no totem ganhou `paid_at`, `pdv_order_number`, `pdv_nota_fiscal` preenchidos:
```bash
pm2 logs totem-pdv-sync --lines 10 --nostream
```
Esperado: nenhuma linha nova de erro; o pedido de teste já não aparece mais em consultas futuras com `paid_at is null`.

- [ ] **Step 6:** Se tudo passou, apagar o pedido de teste do CIGAM (mesmo cuidado desta sessão — avisar/pedir pro dono apagar) e das duas tabelas Supabase (`orders`/`order_items` do totem, `pedidos_totem` já deve ter sido apagada ao abrir).

---

## Self-Review

**Cobertura do que foi combinado com o usuário:**
- ✅ Cliente digita pedido no totem sem mudança nenhuma na experiência dele (Task 8/9/10 mexem só em automação de bastidor).
- ✅ Aba separada "Totem" no PDV, distinta de Pedidos Pré-Digitados (Task 7).
- ✅ Totem só monta o rascunho (na verdade nem chega a tocar CIGAM — mais simples ainda: só entrega os dados prontos pro PDV montar), PDV é quem efetiva o pagamento e a NF (Task 5 grava a referência, o `POST /orders` que já existe faz o resto sem mudança de comportamento).
- ✅ PDV lê os pedidos do totem direto do Supabase (Task 2/3/4), sem fila/webhook novo.
- ✅ Impressão pra portaria: nenhum código novo necessário — o botão de reimprimir já existente, escolhendo "Impressora da Portaria", cobre o caso (confirmado existir em `printerSettings.ts`/`receiptPdf.ts` durante o levantamento).
- ✅ Fotos dos produtos do totem: já confirmadas presentes (177/178, achado durante o levantamento, sem tarefa necessária).
- ✅ Aviso no canto da tela quando chega pedido novo do totem, pra atendente chamar o cliente pelo nome (Task 8, `AvisoPedidoTotem.tsx`).

**Fora de escopo, mencionado mas não incluído:**
- Cadastro do material "Pão de Queijo Gourmet 1kg" no CIGAM Desktop (usuário decidiu tratar depois).
- Bug de mapeamento antigo do "Alho Em Creme com Pimenta Calabresa OMG Bisnaga" (código de caixa em vez de unidade avulsa) — usuário decidiu não mexer por enquanto.

**Placeholder scan:** os dois pontos marcados "*(Nota para quem executa: ...)*" nas Tasks 5 e 9 são avisos legítimos de "usar o padrão já existente no arquivo" — não são lacunas de lógica de negócio, são instruções de onde encaixar em código que só existe no servidor (não pôde ser lido 100% neste levantamento remoto). Se ao executar esses arquivos não tiverem o padrão descrito, é sinal para parar e ajustar o Task antes de prosseguir, não para inventar uma solução nova ali.
