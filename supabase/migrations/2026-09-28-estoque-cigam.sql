-- 28/09/2026: estoque do CIGAM no catálogo do totem.
-- Mantido pelo totem-pdv-sync (automation/estoque/sync-estoque.ts) a cada 5 min.
alter table public.products add column if not exists estoque_cigam numeric(14,3);
alter table public.products add column if not exists estoque_cigam_atualizado_em timestamptz;

comment on column public.products.estoque_cigam is
  'Físico do material na empresa 001 do CIGAM (mesma régua do PDV). <= 0 ou nulo: some do catálogo do totem. Leitura que falha não apaga o último valor bom.';
comment on column public.products.estoque_cigam_atualizado_em is
  'Quando estoque_cigam mudou pela última vez.';

notify pgrst, 'reload schema';

select 'colunas de estoque criadas' as resultado;
