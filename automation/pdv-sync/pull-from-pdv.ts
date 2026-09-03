/**
 * Lê do Supabase do PDV as vendas que já saíram (orders.totem_order_number
 * preenchido) e fecha o pedido correspondente no totem: paid_at, número da
 * venda do PDV e da NF. É o fechamento do ciclo aberto por push-to-pdv.ts —
 * sem isto, o painel do totem (AdminOrders/OrderMonitor) nunca saberia que
 * o cliente pagou.
 */
import { createClient, SupabaseClient } from "@supabase/supabase-js";

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
      console.log(`✅ [pdv-pull] ${venda.totem_order_number} → fechado (venda ${venda.order_number})`);
    } catch (err) {
      erros++;
      console.error(`❌ [pdv-pull] ${venda.totem_order_number}: ${err instanceof Error ? err.message : err}`);
    }
  }

  return { fechados, erros };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const totemSupabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const pdvSupabase = createClient(process.env.PDV_SUPABASE_URL!, process.env.PDV_SUPABASE_SERVICE_ROLE_KEY!);
  reconcilePaidOrders(totemSupabase, pdvSupabase).then((r) => console.log(r));
}
