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
