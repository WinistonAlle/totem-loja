// src/utils/pricingContext.ts

export type CustomerType = "cpf" | "cnpj";
export type ChannelType = "varejo" | "atacado";

export type PricingContext = {
  customer_type: CustomerType;
  channel: ChannelType;
  price_table: string;
  created_at: string;
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
    };
  } catch {
    return null;
  }
}

function toNumber(v: any, fallback = 0) {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Retorna o preço correto do produto baseado no contexto salvo no ContextoCompra.
 * Padrão: CPF + VAREJO (se não tiver contexto)
 */
export function getPriceFromContext(product: any, ctx?: PricingContext | null): number {
  const c = ctx ?? getPricingContext();
  const customer = c?.customer_type ?? "cpf";
  const channel = c?.channel ?? "varejo";

  const key = `price_${customer}_${channel}`; // ex: price_cpf_varejo
  const v = product?.[key];

  // fallback: se ainda não tiver preenchido essa coluna
  return toNumber(v, toNumber(product?.price ?? product?.employee_price ?? 0, 0));
}