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

function pickFirstDefined(product: any, keys: string[]): number | null {
  for (const key of keys) {
    const parsed = toNumber(product?.[key]);
    if (parsed != null && parsed >= 0) return parsed;
  }
  return null;
}

export function isPackageProduct(product: any): boolean {
  const source = getPricingSource(product);
  return toBool(source?.isPackage ?? source?.is_package ?? source?.is_pkg);
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
  if (isPackageProduct(source)) return 1;

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

/**
 * Categorias vendidas por pacote onde o atacado é decidido por CONTAGEM de
 * pacotes, não por peso — regra da loja (confirmada com o dono em
 * 2026-09-04): salgados fritos/assados viram atacado a partir de 10
 * pacotes. Qualquer outra categoria usa peso (ver WEIGHT_ATACADO_THRESHOLD_KG).
 */
const PACKAGE_COUNT_ATACADO_CATEGORIES = new Set(["Salgados P/ Fritar", "Salgados Assados"]);

export const PACKAGE_COUNT_ATACADO_THRESHOLD = 10;
export const WEIGHT_ATACADO_THRESHOLD_KG = 10;

/**
 * Decide o canal (varejo/atacado) de UM item, pela quantidade DAQUELE
 * produto no carrinho — não existe mais uma escolha manual e global de
 * "atacado" pro pedido inteiro (ver ContextoCompra, removida em 2026-09-04).
 * Cada linha do carrinho é avaliada sozinha: 5 coxinhas + 5 risoles
 * continuam os dois em varejo, só quem sozinho passar do limite muda.
 */
export function resolveLineChannel(product: any, quantity: number): ChannelType {
  const source = getPricingSource(product);
  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0) return "varejo";

  const category = String(source?.category ?? "").trim();
  if (PACKAGE_COUNT_ATACADO_CATEGORIES.has(category)) {
    return qty >= PACKAGE_COUNT_ATACADO_THRESHOLD ? "atacado" : "varejo";
  }

  const weight = toNumber(source?.weight ?? source?.weight_kg ?? source?.weightKg) ?? 0;
  const totalKg = weight * qty;
  return totalKg >= WEIGHT_ATACADO_THRESHOLD_KG ? "atacado" : "varejo";
}

/**
 * Preço de UM item pela quantidade dele no carrinho — substitui o antigo
 * fluxo de "contexto de compra" escolhido manualmente na tela inicial.
 * customerType default "cpf": o totem ainda não coleta CPF/CNPJ do cliente
 * (fica pra uma etapa futura), então usa sempre a coluna de pessoa física.
 */
export function resolveProductPrice(product: any, quantity: number, customerType: CustomerType = "cpf"): number {
  const channel = resolveLineChannel(product, quantity);
  const ctx: PricingContextLike = { customer_type: customerType, channel };

  const exact = getExactContextPrice(product, ctx);
  if (exact != null) return exact;

  return getChannelBasePrice(product, channel);
}
