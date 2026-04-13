import { supabase } from "@/lib/supabase";

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = value.replace(",", ".").trim();
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

export async function loadStoredWeightMap(productIds: string[]): Promise<Map<string, number>> {
  const uniqueIds = Array.from(new Set(productIds.filter(Boolean)));
  if (!uniqueIds.length) return new Map();

  const { data, error } = await supabase
    .from("weight")
    .select("product_id, weight")
    .in("product_id", uniqueIds);

  if (error) return new Map();

  const byId = new Map<string, number>();
  for (const row of (data as any[]) ?? []) {
    if (!row?.product_id) continue;
    byId.set(String(row.product_id), toNumber(row.weight, 0));
  }

  return byId;
}

export async function applyStoredWeightsToProducts<
  T extends {
    id?: string | number | null;
    weight?: number | string | null;
  }
>(items: T[]): Promise<T[]> {
  const weightMap = await loadStoredWeightMap(items.map((item) => String(item?.id ?? "")).filter(Boolean));
  if (!weightMap.size) return items;

  return items.map((item) => {
    const nextWeight = weightMap.get(String(item?.id ?? ""));
    return nextWeight === undefined ? item : { ...item, weight: nextWeight };
  });
}
