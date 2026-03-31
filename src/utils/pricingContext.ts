// src/utils/pricingContext.ts
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

export function getPricingContext(): PricingContext | null {
  try {
    const raw = localStorage.getItem("pricing_context");
    if (!raw) return null;
    const parsed = JSON.parse(raw);

    const customer_type = parsed?.customer_type;
    const channel = parsed?.channel;

    if ((customer_type !== "cpf" && customer_type !== "cnpj") || (channel !== "varejo" && channel !== "atacado")) {
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
  try {
    const raw = localStorage.getItem("pricing_context");
    if (!raw) return;
    const parsed = JSON.parse(raw);
    localStorage.setItem(
      "pricing_context",
      JSON.stringify({
        ...parsed,
        customer_name: name.trim(),
      })
    );
    window.dispatchEvent(new Event("pricing_context_changed"));
  } catch {}
}

/**
 * Retorna o preço correto do produto baseado no contexto salvo no ContextoCompra.
 * Padrão: CPF + VAREJO (se não tiver contexto)
 */
export function getPriceFromContext(product: any, ctx?: PricingContext | null): number {
  return resolveProductPrice(product, ctx ?? getPricingContext());
}
