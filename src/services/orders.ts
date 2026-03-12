// src/services/orders.ts
import { supabase } from "@/lib/supabase";

type OrderItemInput = {
  product: any;
  quantity: number;
};

type CreateOrderInput = {
  customerId?: string | null;
  customerDocument: string; // CPF/CNPJ/Doc
  customerName: string;
  items: OrderItemInput[];
  paymentMethod?: string | null;
  payOnPickupCents?: number | null;
};

const SAIBWEB_WEBHOOK_URL = import.meta.env.VITE_SAIBWEB_WEBHOOK_URL?.trim() || "";

function toCents(value: any): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function getUnitPriceCents(product: any): number {
  // Tenta achar um preço válido no seu objeto de produto (fallbacks comuns)
  // Ajuste aqui se no varejo você usa outro campo.
  const price =
    product?.customer_price ??
    product?.retail_price ??
    product?.price ??
    product?.employee_price ??
    0;

  return toCents(price);
}

function getProductOldId(product: any): string | number | null {
  const raw = product?.old_id ?? product?.oldId ?? null;
  if (raw === null || raw === undefined || raw === "") return null;
  return raw;
}

async function enqueueSaibwebOrder(orderId: string) {
  if (!SAIBWEB_WEBHOOK_URL) return { queued: false, skipped: true };

  const response = await fetch(SAIBWEB_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ order_id: orderId }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Falha ao enfileirar pedido no SAIBWEB (${response.status}): ${body || response.statusText}`);
  }

  return { queued: true, skipped: false };
}

export async function createOrder(input: CreateOrderInput): Promise<{
  orderId: string;
  orderNumber: string | null;
  saibwebQueued: boolean;
}> {
  const customerDocument = (input.customerDocument ?? "").toString().trim();
  const customerName = (input.customerName ?? "").toString().trim();
  const payOnPickupCents = Number.isFinite(input.payOnPickupCents) ? Math.max(0, Math.round(input.payOnPickupCents ?? 0)) : 0;

  if (!customerDocument) throw new Error("customerDocument vazio.");
  if (!customerName) throw new Error("customerName vazio.");
  if (!input.items?.length) throw new Error("Pedido sem itens.");

  // 1) cria o pedido (cliente-only)
  const { data: orderRow, error: orderErr } = await supabase
    .from("orders")
    .insert({
      customer_id: input.customerId ?? null,
      customer_document: customerDocument,
      customer_name: customerName,
      employee_cpf: customerDocument,
      employee_name: customerName,
      payment_method: input.paymentMethod ?? "attendant",
      pay_on_pickup_cents: payOnPickupCents,
      wallet_debited: false,
      spent_from_balance_cents: 0,
      status: "aguardando_atendimento",
      saibweb_status: "PENDING",
      saibweb_error: null,
    })
    .select("id, order_number")
    .single();

  if (orderErr) throw orderErr;
  if (!orderRow?.id) throw new Error("Falha ao criar pedido (id vazio).");

  const orderId = orderRow.id as string;
  const orderNumber = (orderRow.order_number ?? null) as string | null;

  // 2) cria os itens
  const rows = input.items.map(({ product, quantity }) => ({
    order_id: orderId,
    product_id: product?.id ?? null,
    product_old_id: getProductOldId(product),
    product_name: (product?.name ?? "Produto").toString(),
    unit_price_cents: getUnitPriceCents(product),
    quantity: Number(quantity) || 1,
  }));

  const { error: itemsErr } = await supabase.from("order_items").insert(rows);
  if (itemsErr) throw itemsErr;

  const saibwebResult = await enqueueSaibwebOrder(orderId);

  return { orderId, orderNumber, saibwebQueued: saibwebResult.queued };
}
