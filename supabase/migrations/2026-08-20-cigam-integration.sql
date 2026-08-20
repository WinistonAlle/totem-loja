-- Integração CIGAM no totem.
-- Rodar manualmente no SQL Editor do Supabase Studio do projeto jsltcdtwdeemwchfyylk
-- (Supabase Cloud, sem acesso Postgres direto).
-- Aditivo e idempotente — não altera nenhum dado existente.
-- Ver docs/superpowers/plans/2026-08-20-integracao-cigam.md, Task 1.

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

-- 3) create_order_v1: passa a gravar erp_status='PENDING' no insert (mantém a
-- lógica de precificação por canal/is_package/weight já existente em produção).
-- Copiar e rodar o CREATE OR REPLACE FUNCTION completo de
-- supabase-local-complete.sql (linhas ~406-578, já atualizado com este diff)
-- para não divergir da versão real do arquivo.
