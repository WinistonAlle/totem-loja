// src/utils/pricingContext.ts
import { APP_EVENT, emitAppEvent } from "@/lib/appEvents";
import { resolveProductPrice } from "./productPricing";

export type CustomerType = "cpf" | "cnpj";
export type ChannelType = "varejo" | "atacado";

export type PricingContext = {
  customer_type: CustomerType;
  channel: ChannelType;
  price_table: string;
  created_at: string;
  customer_name?: string;
};

const PRICING_CONTEXT_KEY = "pricing_context";

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getPricingContext(): PricingContext | null {
  const storage = getStorage();
  if (!storage) return null;

  try {
    const raw = storage.getItem(PRICING_CONTEXT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);

    const customer_type = parsed?.customer_type;
    const channel = parsed?.channel;

    if ((customer_type !== "cpf" && customer_type !== "cnpj") || (channel !== "varejo" && channel !== "atacado")) {
      storage.removeItem(PRICING_CONTEXT_KEY);
      return null;
    }

    return {
      customer_type,
      channel,
      price_table: parsed?.price_table ?? "",
      created_at: parsed?.created_at ?? "",
      customer_name:
        typeof parsed?.customer_name === "string" ? parsed.customer_name.trim() : "",
    };
  } catch {
    return null;
  }
}

export function getPricingChannel(): ChannelType {
  return getPricingContext()?.channel ?? "varejo";
}

export function hasPricingContext(): boolean {
  return !!getPricingContext();
}

export function getPricingContextCustomerName(): string {
  return getPricingContext()?.customer_name?.trim() ?? "";
}

export function updatePricingContextCustomerName(name: string) {
  const storage = getStorage();
  if (!storage) return;

  try {
    const raw = storage.getItem(PRICING_CONTEXT_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    storage.setItem(
      PRICING_CONTEXT_KEY,
      JSON.stringify({
        ...parsed,
        customer_name: name.trim(),
      })
    );
    emitAppEvent(APP_EVENT.pricingContextChanged);
  } catch {}
}

export function updatePricingChannel(channel: ChannelType) {
  const storage = getStorage();
  if (!storage) return;

  try {
    const raw = storage.getItem(PRICING_CONTEXT_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    const customerType: CustomerType =
      channel === "atacado"
        ? parsed?.customer_type === "cnpj"
          ? "cnpj"
          : "cpf"
        : "cpf";

    storage.setItem(
      PRICING_CONTEXT_KEY,
      JSON.stringify({
        ...parsed,
        channel,
        customer_type: customerType,
        price_table: `${channel.toUpperCase()}_${customerType.toUpperCase()}`,
      })
    );
    emitAppEvent(APP_EVENT.pricingContextChanged);
  } catch {}
}

/**
 * Retorna o preço correto do produto baseado no contexto salvo no ContextoCompra.
 * Padrão: CPF + VAREJO (se não tiver contexto)
 */
export function getPriceFromContext(product: any, ctx?: PricingContext | null): number {
  return resolveProductPrice(product, ctx ?? getPricingContext());
}
