/**
 * Empurra pedidos novos do totem para a fila de caixa do PDV
 * (tabela pedidos_totem, Supabase do pdv-gm) — substitui o antigo
 * automation/cigam/process-pending-orders.ts: o totem não fala mais com o
 * CIGAM, quem faz isso agora é o PDV no momento em que o caixa cobra.
 *
 * Preço: para material KG o PDV espera unitPrice em R$/kg e cobra
 * unitPrice × packageWeightKg por pacote (lineTotal em pdv-gm orderService.ts).
 * O totem guarda o preço do PACOTE, então aqui ele é dividido pelo peso. Até
 * 28/09/2026 ia o preço do pacote direto, e um pacote de 3 kg de R$ 73,50
 * chegaria ao caixa como R$ 220,50. A regra é: o caixa cobra exatamente o
 * que o totem mostrou. Para PCT/UN/CX o preço do pacote já é o do CIGAM.
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

    const precoDoPacote = item.unit_price_cents / 100;
    const comPeso = porKg && peso;

    return {
      cigamCode: produto.cigam_code,
      productName: item.product_name,
      unit: unidade,
      quantity: item.quantity,
      unitPrice: comPeso ? Math.round((precoDoPacote / peso) * 10000) / 10000 : precoDoPacote,
      ...(comPeso ? { packageWeightKg: peso } : {})
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
    // Novos e os que falharam há mais de um minuto. Antes um pedido que
    // falhava uma vez (rede, Supabase fora) ficava ERROR para sempre e o
    // cliente esperava no caixa por um pedido que nunca apareceu. Pago não
    // volta: já foi vendido.
    .or(`pdv_sync_status.is.null,and(pdv_sync_status.eq.ERROR,updated_at.lt.${new Date(Date.now() - 60_000).toISOString()})`)
    .is("paid_at", null)
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) throw new Error(`Falha ao buscar pedidos pendentes de envio ao PDV: ${error.message}`);

  let enviados = 0;
  let erros = 0;

  for (const order of (orders ?? []) as unknown as OrderRow[]) {
    try {
      const payload = buildTotemOrderPayload(order);
      const { error: insertError } = await pdvSupabase.from("pedidos_totem").insert(payload);
      // 23505 = totem_order_id já está na fila: a tentativa anterior entrou e
      // só a resposta se perdeu. Conta como enviado, sem duplicar.
      if (insertError && insertError.code !== "23505") throw new Error(insertError.message);

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
        .update({ pdv_sync_status: "ERROR", pdv_sync_error: message, updated_at: new Date().toISOString() })
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
