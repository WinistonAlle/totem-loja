-- 2026-09-04-meus-pedidos-numero-real.sql
-- "Meus Pedidos" (MyOrdersPage.tsx) mostrava o numero interno GM-AAAAMMDD-####
-- pro cliente ("#GM-20260904-001117") em vez do numero real do pedido no
-- CIGAM. Regra ja usada em outros sistemas da empresa (ver memoria
-- feedback_numero_pedido_cigam): o numero que aparece tem que ser o do
-- CIGAM (aqui, pdv_order_number -- preenchido por
-- automation/pdv-sync/pull-from-pdv.ts quando o caixa do PDV cobra), nunca
-- o interno. Precisa dropar porque muda o shape das colunas de retorno, nao
-- so o corpo -- create or replace nao permite isso.
drop function if exists public.customer_orders_with_items(text);

create function public.customer_orders_with_items(p_customer_document text)
returns table (
  id uuid,
  order_number text,
  customer_name text,
  total_items integer,
  total_value numeric,
  status text,
  created_at timestamptz,
  paid_at timestamptz,
  pdv_order_number text,
  order_items jsonb
)
language sql
security definer
set search_path = public
as $$
  with filtered_orders as (
    select o.*
    from public.orders o
    where public.only_digits(coalesce(o.customer_document, '')) = public.only_digits(p_customer_document)
       or coalesce(o.customer_document, '') = coalesce(p_customer_document, '')
    order by o.created_at desc
  )
  select
    o.id,
    o.order_number,
    o.customer_name,
    o.total_items,
    o.total_value,
    o.status,
    o.created_at,
    o.paid_at,
    o.pdv_order_number,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', oi.id,
            'product_id', oi.product_id,
            'product_name', oi.product_name,
            'quantity', oi.quantity,
            'unit_price', oi.unit_price,
            'total_price', oi.total_price
          )
          order by oi.created_at asc
        )
        from public.order_items oi
        where oi.order_id = o.id
      ),
      '[]'::jsonb
    ) as order_items
  from filtered_orders o;
$$;
