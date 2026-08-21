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
