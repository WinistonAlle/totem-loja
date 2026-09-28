-- 28/09/2026: create_order_v1 calcula o preço com as MESMAS regras do carrinho.
--
-- A versão anterior decidia varejo/atacado para o pedido inteiro pela forma de
-- pagamento e usava products.weight. O totem passou (04/09) a decidir o canal
-- item por item, pela quantidade, e a usar o peso da tabela `weight`. Com isso a
-- RPC recusava pedidos com "Os preços do carrinho foram atualizados" (visto em
-- 23/09) sempre que um item passava a atacado ou o peso das duas tabelas
-- divergia. O app cai então na conferência dele (createOrderViaClientFallback),
-- que foi corrigida no mesmo dia; esta versão devolve o pedido ao caminho
-- transacional.
--
-- Aplicar no SQL Editor do projeto jsltcdtwdeemwchfyylk (colar o arquivo todo).

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
    round(
      case
        when pr.tem_tabela then coalesce(case when c.canal = 'atacado' then p.price_cpf_atacado else p.price_cpf_varejo end, 0)
        when c.canal = 'atacado' then coalesce(
          nullif(greatest(coalesce(p.price_cnpj_atacado, 0), 0), 0),
          nullif(greatest(coalesce(p.price_cpf_atacado, 0), 0), 0),
          nullif(greatest(coalesce(p.employee_price, 0), 0), 0),
          nullif(greatest(coalesce(p.price_cpf_varejo, 0), 0), 0),
          nullif(greatest(coalesce(p.price_cnpj_varejo, 0), 0), 0),
          nullif(greatest(coalesce(p.price, 0), 0), 0),
          0
        )
        else coalesce(
          nullif(greatest(coalesce(p.price_cpf_varejo, 0), 0), 0),
          nullif(greatest(coalesce(p.price_cnpj_varejo, 0), 0), 0),
          nullif(greatest(coalesce(p.price, 0), 0), 0),
          nullif(greatest(coalesce(p.price_cnpj_atacado, 0), 0), 0),
          nullif(greatest(coalesce(p.price_cpf_atacado, 0), 0), 0),
          nullif(greatest(coalesce(p.employee_price, 0), 0), 0),
          0
        )
      end
      * c.mult
      * 100
    )::integer
  from jsonb_to_recordset(p_items) as i(product_id uuid, quantity numeric)
  join public.products p on p.id = i.product_id
  -- o peso da tabela `weight` manda sobre products.weight, como no app
  -- (applyStoredWeightsToProducts / loadStoredWeightMap)
  left join public.weight w on w.product_id = p.id
  cross join lateral (
    select coalesce(w.weight, p.weight, 0)::numeric as peso,
           (p.price_cpf_varejo is not null or p.price_cnpj_varejo is not null
             or p.price_cpf_atacado is not null or p.price_cnpj_atacado is not null) as tem_tabela
  ) pr
  -- canal por ITEM, igual a resolveLineChannel (src/utils/productPricing.ts):
  -- salgados (categorias 2 e 3) viram atacado aos 10 pacotes; o resto aos 10 kg
  cross join lateral (
    select
      case
        when p.category_id in (2, 3) then case when floor(i.quantity) >= 10 then 'atacado' else 'varejo' end
        when pr.peso * floor(i.quantity) >= 10 then 'atacado'
        else 'varejo'
      end as canal,
      case
        when coalesce(p.is_package, false) then 1
        when pr.peso > 1 then pr.peso
        else 1
      end as mult
  ) c
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
