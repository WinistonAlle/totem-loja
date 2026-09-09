// src/utils/pricingContext.ts
//
// O canal (varejo/atacado) não é mais escolhido manualmente aqui — cada
// item do carrinho decide sozinho pela própria quantidade (ver
// resolveLineChannel em productPricing.ts). Este arquivo ficou só com o
// nome do cliente, que ainda precisa sobreviver entre o catálogo e o
// checkout.

const PRICING_CONTEXT_KEY = "pricing_context";

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getPricingContextCustomerName(): string {
  const storage = getStorage();
  if (!storage) return "";

  try {
    const raw = storage.getItem(PRICING_CONTEXT_KEY);
    if (!raw) return "";
    const parsed = JSON.parse(raw);
    return typeof parsed?.customer_name === "string" ? parsed.customer_name.trim() : "";
  } catch {
    return "";
  }
}

export function updatePricingContextCustomerName(name: string) {
  const storage = getStorage();
  if (!storage) return;

  try {
    const raw = storage.getItem(PRICING_CONTEXT_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    storage.setItem(
      PRICING_CONTEXT_KEY,
      JSON.stringify({
        ...parsed,
        customer_name: name.trim(),
      })
    );
  } catch {}
}

export function clearPricingContext() {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(PRICING_CONTEXT_KEY);
  } catch {}
}
