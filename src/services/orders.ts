// src/services/orders.ts
import { supabase } from "@/lib/supabase";
import { getChannelBasePrice, resolveProductPrice } from "@/utils/productPricing";
import { recordSystemEvent } from "@/lib/systemEvents";
import { WHOLESALE_WEIGHT_THRESHOLD_KG, getOrderTotalWeightKg, hasWholesaleAccess } from "@/utils/wholesaleRules";

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
const SAIBWEB_WEBHOOK_TOKEN = import.meta.env.VITE_SAIBWEB_WEBHOOK_TOKEN?.trim() || "";
const REQUIRE_ORDER_RPC = String(import.meta.env.VITE_REQUIRE_ORDER_RPC ?? "").toLowerCase() === "true";

type ChannelType = "varejo" | "atacado";

type ProductRow = {
  id: string;
  old_id?: string | number | null;
  name?: string | null;
  price?: number | string | null;
  employee_price?: number | string | null;
  price_cpf_varejo?: number | string | null;
  price_cpf_atacado?: number | string | null;
  price_cnpj_varejo?: number | string | null;
  price_cnpj_atacado?: number | string | null;
};

type RpcOrderRow = {
  order_id: string;
  order_number: string | null;
  total_cents: number | null;
  pay_on_pickup_cents: number | null;
  status: string | null;
};

type CreateOrderResult = {
  orderId: string;
  orderNumber: string | null;
  saibwebQueued: boolean;
  saibwebError?: string | null;
};

function toCents(value: any): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function getUnitPriceCents(product: any): number {
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

function isMissingRpcError(error: any): boolean {
  const code = String(error?.code ?? "");
  const message = String(error?.message ?? "").toLowerCase();
  const details = String(error?.details ?? "").toLowerCase();

  return code === "PGRST202" || message.includes("create_order_v1") || details.includes("create_order_v1");
}

function parsePositiveQuantity(quantity: number): number {
  const parsed = Math.floor(Number(quantity));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("Quantidade inválida no pedido.");
  }

  return parsed;
}

function inferPricingChannel(paymentMethod: string): ChannelType {
  return paymentMethod.toLowerCase().includes("atacado") ? "atacado" : "varejo";
}

function getAuthoritativeUnitPriceCents(product: ProductRow, channel: ChannelType): number {
  const chosen = resolveProductPrice(product, {
    customer_type: channel === "atacado" ? "cnpj" : "cpf",
    channel,
  }) || getChannelBasePrice(product, channel);
  const cents = toCents(chosen);

  if (cents <= 0) {
    throw new Error(`Produto sem preço válido para o canal ${channel}.`);
  }

  return cents;
}

async function loadAuthoritativeProducts(productIds: string[]): Promise<Map<string, ProductRow>> {
  const uniqueIds = Array.from(new Set(productIds.filter(Boolean)));
  if (!uniqueIds.length) {
    throw new Error("Pedido sem produtos válidos.");
  }

  const { data, error } = await supabase
    .from("products")
    .select(
      "id, old_id, name, price, employee_price, price_cpf_varejo, price_cpf_atacado, price_cnpj_varejo, price_cnpj_atacado"
    )
    .in("id", uniqueIds);

  if (error) throw error;

  return new Map(((data as ProductRow[] | null) ?? []).map((product) => [String(product.id), product]));
}

async function rollbackOrder(orderId: string) {
  await supabase.from("orders").delete().eq("id", orderId);
}

async function markSaibwebFailure(orderId: string, message: string) {
  await supabase
    .from("orders")
    .update({
      saibweb_status: "ERROR",
      saibweb_error: message,
    })
    .eq("id", orderId);
}

async function markSaibwebQueued(orderId: string) {
  await supabase
    .from("orders")
    .update({
      saibweb_status: "QUEUED",
      saibweb_error: null,
    })
    .eq("id", orderId);
}

async function enqueueSaibwebOrder(orderId: string) {
  if (!SAIBWEB_WEBHOOK_URL) return { queued: false, skipped: true };

  const response = await fetch(SAIBWEB_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(SAIBWEB_WEBHOOK_TOKEN ? { "x-webhook-token": SAIBWEB_WEBHOOK_TOKEN } : {}),
    },
    body: JSON.stringify({ order_id: orderId }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Falha ao enfileirar pedido no SAIBWEB (${response.status}): ${body || response.statusText}`);
  }

  return { queued: true, skipped: false };
}

async function finalizeSaibweb(orderId: string, orderNumber: string | null): Promise<CreateOrderResult> {
  try {
    const saibwebResult = await enqueueSaibwebOrder(orderId);
    if (saibwebResult.queued) {
      await markSaibwebQueued(orderId);
    }

    return {
      orderId,
      orderNumber,
      saibwebQueued: saibwebResult.queued,
      saibwebError: null,
    };
  } catch (error: any) {
    const saibwebError =
      error?.message || "Pedido salvo, mas houve falha ao enviar para a integração SAIBWEB.";
    await markSaibwebFailure(orderId, saibwebError);

    return {
      orderId,
      orderNumber,
      saibwebQueued: false,
      saibwebError,
    };
  } finally {
    await recordSystemEvent({
      eventName: "order_saibweb_status",
      severity: "info",
      message: "Pedido processado para integracao SAIBWEB.",
      payload: {
        orderId,
        orderNumber,
      },
    });
  }
}

async function tryCreateOrderViaRpc(input: CreateOrderInput): Promise<CreateOrderResult | null> {
  const customerDocument = (input.customerDocument ?? "").toString().trim();
  const customerName = (input.customerName ?? "").toString().trim();
  const paymentMethod = input.paymentMethod ?? "attendant";
  const pricingChannel = inferPricingChannel(paymentMethod);

  if (!customerDocument) throw new Error("customerDocument vazio.");
  if (!customerName) throw new Error("customerName vazio.");
  if (!input.items?.length) throw new Error("Pedido sem itens.");
  if (pricingChannel === "atacado" && !hasWholesaleAccess(getOrderTotalWeightKg(input.items))) {
    throw new Error(`O atacado só libera com ${WHOLESALE_WEIGHT_THRESHOLD_KG}kg no carrinho.`);
  }

  const payloadItems = input.items.map(({ product, quantity }) => ({
    product_id: String(product?.id ?? ""),
    quantity: parsePositiveQuantity(quantity),
  }));
  const payOnPickupCents = Number.isFinite(input.payOnPickupCents)
    ? Math.max(0, Math.round(input.payOnPickupCents ?? 0))
    : null;

  const { data, error } = await supabase.rpc("create_order_v1", {
    p_customer_id: input.customerId ?? null,
    p_customer_document: customerDocument,
    p_customer_name: customerName,
    p_payment_method: paymentMethod,
    p_pay_on_pickup_cents: payOnPickupCents,
    p_items: payloadItems,
  });

  if (error) {
    if (isMissingRpcError(error)) {
      if (REQUIRE_ORDER_RPC) {
        throw new Error("A RPC create_order_v1 é obrigatória, mas não está disponível neste ambiente.");
      }
      return null;
    }
    throw error;
  }

  const row = (Array.isArray(data) ? data[0] : data) as RpcOrderRow | null;
  if (!row?.order_id) {
    throw new Error("Falha ao criar pedido via RPC.");
  }

  await recordSystemEvent({
    eventName: "order_rpc_success",
    severity: "info",
    message: "Pedido criado via RPC transacional.",
    payload: {
      orderId: row.order_id,
      orderNumber: row.order_number,
      items: payloadItems.length,
    },
  });

  return finalizeSaibweb(row.order_id, row.order_number ?? null);
}

async function createOrderViaClientFallback(input: CreateOrderInput): Promise<CreateOrderResult> {
  const customerDocument = (input.customerDocument ?? "").toString().trim();
  const customerName = (input.customerName ?? "").toString().trim();
  const paymentMethod = input.paymentMethod ?? "attendant";
  const pricingChannel = inferPricingChannel(paymentMethod);

  if (!customerDocument) throw new Error("customerDocument vazio.");
  if (!customerName) throw new Error("customerName vazio.");
  if (!input.items?.length) throw new Error("Pedido sem itens.");
  if (pricingChannel === "atacado" && !hasWholesaleAccess(getOrderTotalWeightKg(input.items))) {
    throw new Error(`O atacado só libera com ${WHOLESALE_WEIGHT_THRESHOLD_KG}kg no carrinho.`);
  }

  const authoritativeProducts = await loadAuthoritativeProducts(
    input.items.map(({ product }) => String(product?.id ?? ""))
  );
  const normalizedItems = input.items.map(({ product, quantity }) => {
    const productId = String(product?.id ?? "");
    const authoritativeProduct = authoritativeProducts.get(productId);

    if (!productId || !authoritativeProduct) {
      throw new Error(`Produto inválido ou desatualizado no carrinho: ${product?.name ?? productId}.`);
    }

    const safeQuantity = parsePositiveQuantity(quantity);
    const unitPriceCents = getAuthoritativeUnitPriceCents(authoritativeProduct, pricingChannel);

    return {
      order_id: "",
      product_id: productId,
      product_old_id: getProductOldId(authoritativeProduct),
      product_name: (authoritativeProduct.name ?? product?.name ?? "Produto").toString(),
      unit_price_cents: unitPriceCents,
      quantity: safeQuantity,
    };
  });

  const authoritativeTotalCents = normalizedItems.reduce(
    (sum, item) => sum + item.unit_price_cents * item.quantity,
    0
  );
  const payOnPickupCents = Number.isFinite(input.payOnPickupCents)
    ? Math.max(0, Math.round(input.payOnPickupCents ?? 0))
    : paymentMethod.startsWith("attendant")
      ? authoritativeTotalCents
      : 0;

  if (paymentMethod.startsWith("attendant") && payOnPickupCents !== authoritativeTotalCents) {
    throw new Error("Os preços do carrinho foram atualizados. Revise os itens antes de confirmar.");
  }

  // 1) cria o pedido (cliente-only)
  const { data: orderRow, error: orderErr } = await supabase
    .from("orders")
    .insert({
      customer_id: input.customerId ?? null,
      customer_document: customerDocument,
      customer_name: customerName,
      payment_method: paymentMethod,
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
  const rows = normalizedItems.map((item) => ({
    ...item,
    order_id: orderId,
  }));

  const { error: itemsErr } = await supabase.from("order_items").insert(rows);
  if (itemsErr) {
    await rollbackOrder(orderId);
    throw itemsErr;
  }

  await recordSystemEvent({
    eventName: "order_client_fallback",
    severity: REQUIRE_ORDER_RPC ? "error" : "warning",
    message: "Pedido criado pelo fluxo cliente fallback.",
    payload: {
      orderId,
      orderNumber,
      items: rows.length,
      pricingChannel,
    },
  });

  return finalizeSaibweb(orderId, orderNumber);
}

export async function createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
  const startedAt = Date.now();

  try {
    const rpcResult = await tryCreateOrderViaRpc(input);
    if (rpcResult) {
      await recordSystemEvent({
        eventName: "order_success",
        severity: "info",
        message: "Pedido finalizado com sucesso.",
        payload: {
          orderId: rpcResult.orderId,
          orderNumber: rpcResult.orderNumber,
          durationMs: Date.now() - startedAt,
          saibwebQueued: rpcResult.saibwebQueued,
        },
      });
      return rpcResult;
    }

    const fallbackResult = await createOrderViaClientFallback(input);
    await recordSystemEvent({
      eventName: "order_success",
      severity: "warning",
      message: "Pedido finalizado com sucesso via fallback cliente.",
      payload: {
        orderId: fallbackResult.orderId,
        orderNumber: fallbackResult.orderNumber,
        durationMs: Date.now() - startedAt,
        saibwebQueued: fallbackResult.saibwebQueued,
      },
    });
    return fallbackResult;
  } catch (error: any) {
    await recordSystemEvent({
      eventName: "order_failure",
      severity: "error",
      message: error?.message || "Falha ao criar pedido.",
      payload: {
        durationMs: Date.now() - startedAt,
        items: input.items?.length ?? 0,
        paymentMethod: input.paymentMethod ?? "attendant",
      },
    });
    throw error;
  }
}
