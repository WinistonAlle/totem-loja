export type CustomerType = "cpf" | "cnpj";
export type ChannelType = "varejo" | "atacado";

export type PricingContextLike = {
  customer_type?: CustomerType | null;
  channel?: ChannelType | null;
  price_table?: string | null;
} | null;

function getPricingSource(product: any) {
  if (product && typeof product === "object" && product.__pricingSource && typeof product.__pricingSource === "object") {
    return product.__pricingSource;
  }
  return product;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = value.replace(",", ".").trim();
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function pickFirstDefined(product: any, keys: string[]): number | null {
  for (const key of keys) {
    const parsed = toNumber(product?.[key]);
    if (parsed != null && parsed >= 0) return parsed;
  }
  return null;
}

function pickFirstPositive(product: any, keys: string[]): number | null {
  for (const key of keys) {
    const parsed = toNumber(product?.[key]);
    if (parsed != null && parsed > 0) return parsed;
  }
  return null;
}

function hasExplicitPricingTable(product: any): boolean {
  return [
    "price_cpf_varejo",
    "price_cnpj_varejo",
    "price_cpf_atacado",
    "price_cnpj_atacado",
  ].some((key) => toNumber(product?.[key]) != null);
}

function getWeightMultiplier(product: any): number {
  const source = getPricingSource(product);
  const weight = toNumber(source?.weight ?? source?.weight_kg ?? source?.weightKg);
  if (weight != null && weight > 1) return weight;
  return 1;
}

function getFinalPriceFromKgValue(product: any, pricePerKg: number | null): number | null {
  if (pricePerKg == null) return null;
  return pricePerKg * getWeightMultiplier(product);
}

function getExactContextPrice(product: any, ctx: PricingContextLike): number | null {
  const customerType = ctx?.customer_type;
  const channel = ctx?.channel;
  if (!customerType || !channel) return null;
  const source = getPricingSource(product);

  if (hasExplicitPricingTable(source)) {
    return getFinalPriceFromKgValue(source, pickFirstDefined(source, [`price_${customerType}_${channel}`])) ?? 0;
  }

  return getFinalPriceFromKgValue(source, pickFirstPositive(source, [`price_${customerType}_${channel}`]));
}

export function getChannelBasePrice(product: any, channel: ChannelType = "varejo"): number {
  const source = getPricingSource(product);
  const explicitVarejoKeys = ["price_cpf_varejo", "price_cnpj_varejo"];
  const explicitAtacadoKeys = ["price_cnpj_atacado", "price_cpf_atacado"];

  if (hasExplicitPricingTable(source)) {
    const explicitKeys = channel === "atacado" ? explicitAtacadoKeys : explicitVarejoKeys;
    return getFinalPriceFromKgValue(source, pickFirstDefined(source, explicitKeys)) ?? 0;
  }

  const varejoKeys = [
    "price_cpf_varejo",
    "price_cnpj_varejo",
    "retail_price",
    "customer_price",
    "price_public",
    "price",
  ];

  const atacadoKeys = [
    "price_cnpj_atacado",
    "price_cpf_atacado",
    "wholesale_price",
    "price_employee",
    "employee_price",
  ];

  const ownChannel = channel === "atacado" ? atacadoKeys : varejoKeys;
  const oppositeChannel = channel === "atacado" ? varejoKeys : atacadoKeys;

  return getFinalPriceFromKgValue(
    source,
    pickFirstPositive(source, ownChannel) ?? pickFirstPositive(source, oppositeChannel)
  ) ?? 0;
}

export function resolveProductPrice(product: any, ctx?: PricingContextLike): number {
  const exact = getExactContextPrice(product, ctx ?? null);
  if (exact != null) return exact;

  const channel = ctx?.channel === "atacado" ? "atacado" : "varejo";
  return getChannelBasePrice(product, channel);
}
