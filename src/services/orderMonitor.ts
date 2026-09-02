import { supabase } from "@/lib/supabase";
import type { OrderAutomationStatus, OrderMonitorOrder, OrderMonitorStatus } from "@/types/order-monitor";

type OrdersQueryRow = {
  id: string;
  order_number: string | null;
  customer_name: string | null;
  payment_method: string | null;
  total_value: number | null;
  total_cents: number | null;
  status: string | null;
  created_at: string;
  erp_status: OrderAutomationStatus;
  erp_error: string | null;
  erp_external_id: string | null;
  erp_nota_fiscal: string | null;
  cancelled_at: string | null;
};

type OrderItemRow = {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string | null;
  quantity: number | null;
  total_price: number | null;
};

type ProductWeightRow = {
  id: string;
  weight: number | string | null;
};

export type OrderMonitorDateRange = {
  start: Date;
  end: Date;
};

function mapBusinessStatus(status: string | null): OrderMonitorStatus {
  switch (String(status ?? "").toLowerCase()) {
    case "em_separacao":
      return "em_preparo";
    case "pronto_para_retirada":
      return "pronto";
    case "entregue":
      return "finalizado";
    case "cancelado":
      return "cancelado";
    case "aguardando_separacao":
    case "aguardando_atendimento":
    default:
      return "novo";
  }
}

export function getDayRange(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return { start, end };
}

function getPricingTable(paymentMethod: string | null): "varejo" | "atacado" | null {
  const normalized = String(paymentMethod ?? "").toLowerCase();
  if (normalized.includes("atacado")) return "atacado";
  if (normalized.includes("varejo")) return "varejo";
  return null;
}

export async function fetchOrderMonitorOrders(range: OrderMonitorDateRange) {
  const { data: ordersData, error: ordersError } = await supabase
    .from("orders")
    .select(
      "id, order_number, customer_name, payment_method, total_value, total_cents, status, created_at, erp_status, erp_error, erp_external_id, erp_nota_fiscal, cancelled_at"
    )
    .gte("created_at", range.start.toISOString())
    .lt("created_at", range.end.toISOString())
    .order("created_at", { ascending: false })
    .limit(120);

  if (ordersError) throw ordersError;

  const liveOrders = ((ordersData ?? []) as OrdersQueryRow[]).filter((row) => !row.cancelled_at);
  const orderIds = liveOrders.map((row) => row.id);

  let orderItemsByOrderId = new Map<string, OrderItemRow[]>();

  if (orderIds.length > 0) {
    const { data: itemsData, error: itemsError } = await supabase
      .from("order_items")
      .select("id, order_id, product_id, product_name, quantity, total_price")
      .in("order_id", orderIds)
      .order("created_at", { ascending: true });

    if (itemsError) throw itemsError;

    orderItemsByOrderId = ((itemsData ?? []) as OrderItemRow[]).reduce((map, item) => {
      const current = map.get(item.order_id) ?? [];
      current.push(item);
      map.set(item.order_id, current);
      return map;
    }, new Map<string, OrderItemRow[]>());
  }

  const productIds = Array.from(
    new Set(
      Array.from(orderItemsByOrderId.values())
        .flat()
        .map((item) => item.product_id)
        .filter((value): value is string => Boolean(value))
    )
  );

  let weightByProductId = new Map<string, number>();

  if (productIds.length > 0) {
    const { data: productsData, error: productsError } = await supabase
      .from("products")
      .select("id, weight")
      .in("id", productIds);

    if (productsError) throw productsError;

    weightByProductId = ((productsData ?? []) as ProductWeightRow[]).reduce((map, product) => {
      map.set(String(product.id), Number(product.weight ?? 0) || 0);
      return map;
    }, new Map<string, number>());
  }

  return liveOrders.map<OrderMonitorOrder>((row) => ({
      id: row.id,
      orderNumber: row.order_number,
      customerName: row.customer_name?.trim() || "Cliente sem nome",
      createdAt: row.created_at,
      status: mapBusinessStatus(row.status),
      total: Number(row.total_cents ?? 0) > 0 ? Number(row.total_cents) / 100 : Number(row.total_value ?? 0),
      notes: null,
      pricingTable: getPricingTable(row.payment_method),
      totalWeightKg: (orderItemsByOrderId.get(row.id) ?? []).reduce((sum, item) => {
        const quantity = Number(item.quantity ?? 0) || 0;
        const itemWeight = item.product_id ? weightByProductId.get(item.product_id) ?? 0 : 0;
        return sum + itemWeight * quantity;
      }, 0),
      erpStatus: row.erp_status ?? null,
      erpError: row.erp_error ?? null,
      erpExternalId: row.erp_external_id ?? null,
      erpNotaFiscal: row.erp_nota_fiscal ?? null,
      isLive: true,
      items: (orderItemsByOrderId.get(row.id) ?? []).map((item) => ({
        id: item.id,
        name: item.product_name?.trim() || "Item sem nome",
        quantity: Number(item.quantity ?? 0) || 0,
        total: Number(item.total_price ?? 0) || 0,
        weight: item.product_id ? weightByProductId.get(item.product_id) ?? 0 : 0,
      })),
    }));
}

/**
 * Recoloca o pedido na fila do CIGAM. Nao existe mais webhook para chamar: o
 * processo pm2 `totem-loja-cigam` varre `erp_status = "PENDING"` em loop, entao
 * voltar a coluna para PENDING E o reenfileiramento.
 */
export async function retryOrderAutomation(
  order: Pick<OrderMonitorOrder, "id" | "erpStatus" | "erpExternalId">
) {
  if (order.erpStatus === "DONE") {
    throw new Error("Pedido ja lancado no CIGAM. Nao reenviar — geraria um segundo pedido.");
  }

  // Mesma regra que process-pending-orders.ts aplica do lado de la: se o
  // cabecalho ja subiu numa tentativa anterior, reprocessar cria um pedido
  // duplicado no ERP em vez de completar o que ficou pela metade.
  if (order.erpExternalId) {
    throw new Error(
      `O cabecalho ${order.erpExternalId} ja existe no CIGAM de uma tentativa anterior. ` +
        "Confira e complete o pedido direto na tela do CIGAM em vez de reenviar."
    );
  }

  const { error: updateError } = await supabase
    .from("orders")
    .update({
      erp_status: "PENDING",
      erp_error: null,
      erp_synced_at: null,
    })
    .eq("id", order.id);

  if (updateError) throw updateError;
}
