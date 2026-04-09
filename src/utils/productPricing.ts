export type CustomerType = "cpf" | "cnpj";
export type ChannelType = "varejo" | "atacado";

export type PricingContextLike = {
  customer_type?: CustomerType | null;
  channel?: ChannelType | null;
  price_table?: string | null;
} | null;

function toBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "sim", "yes"].includes(normalized)) return true;
    if (["false", "0", "nao", "não", "no"].includes(normalized)) return false;
  }
  return false;
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

export function isPackageProduct(product: any): boolean {
  return toBool(product?.isPackage ?? product?.is_package ?? product?.is_pkg);
}

function pickFirstPositive(product: any, keys: string[]): number | null {
  for (const key of keys) {
    const parsed = toNumber(product?.[key]);
    if (parsed != null && parsed > 0) return parsed;
  }
  return null;
}

function getWeightMultiplier(product: any): number {
  if (isPackageProduct(product)) return 1;

  const weight = toNumber(product?.weight ?? product?.weight_kg ?? product?.weightKg);
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

  return getFinalPriceFromKgValue(product, pickFirstPositive(product, [`price_${customerType}_${channel}`]));
}

export function getChannelBasePrice(product: any, channel: ChannelType = "varejo"): number {
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
    product,
    pickFirstPositive(product, ownChannel) ?? pickFirstPositive(product, oppositeChannel)
  ) ?? 0;
}

export function resolveProductPrice(product: any, ctx?: PricingContextLike): number {
  const exact = getExactContextPrice(product, ctx ?? null);
  if (exact != null) return exact;

  const channel = ctx?.channel === "atacado" ? "atacado" : "varejo";
  return getChannelBasePrice(product, channel);
}
