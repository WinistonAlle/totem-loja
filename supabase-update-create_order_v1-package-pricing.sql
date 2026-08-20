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
    saibweb_error
  )
  values (
    p_customer_id,
    btrim(p_customer_document),
    btrim(p_customer_name),
    v_payment_method,
    false,
    0,
    'aguardando_atendimento',
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
      when v_channel = 'atacado' and coalesce(p.price_cnpj_atacado, 0) > 0 then round(
        p.price_cnpj_atacado
        * case
            when coalesce(p.is_package, false) then 1
            when coalesce(p.weight, 0) > 1 then p.weight
            else 1
          end
        * 100
      )::integer
      when v_channel = 'varejo' and coalesce(p.price_cpf_varejo, 0) > 0 then round(
        p.price_cpf_varejo
        * case
            when coalesce(p.is_package, false) then 1
            when coalesce(p.weight, 0) > 1 then p.weight
            else 1
          end
        * 100
      )::integer
      when coalesce(p.price, 0) > 0 then round(
        p.price
        * case
            when coalesce(p.is_package, false) then 1
            when coalesce(p.weight, 0) > 1 then p.weight
            else 1
          end
        * 100
      )::integer
      when coalesce(p.employee_price, 0) > 0 then round(
        p.employee_price
        * case
            when coalesce(p.is_package, false) then 1
            when coalesce(p.weight, 0) > 1 then p.weight
            else 1
          end
        * 100
      )::integer
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
