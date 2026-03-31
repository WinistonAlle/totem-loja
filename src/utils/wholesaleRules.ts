export const WHOLESALE_WEIGHT_THRESHOLD_KG = 15;

export function hasWholesaleAccess(totalWeight: number | null | undefined): boolean {
  return Number(totalWeight ?? 0) >= WHOLESALE_WEIGHT_THRESHOLD_KG;
}

export function getOrderTotalWeightKg(
  items: Array<{ product?: any; quantity?: number | null | undefined }>
): number {
  return (items ?? []).reduce((total, item) => {
    const weight = Number(item?.product?.weight ?? item?.product?.weight_kg ?? 0);
    const quantity = Number(item?.quantity ?? 0);
    if (!Number.isFinite(weight) || !Number.isFinite(quantity)) return total;
    return total + weight * quantity;
  }, 0);
}
