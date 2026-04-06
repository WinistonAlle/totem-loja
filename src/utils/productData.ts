import type { Product } from "@/types/products";

export function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const normalized = value.replace(",", ".").trim();
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

export function toBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "sim", "yes"].includes(normalized)) return true;
    if (["false", "0", "nao", "não", "no"].includes(normalized)) return false;
  }

  if (typeof value === "number") return value !== 0;

  return false;
}

export function getProductImages(product: Partial<Product> & Record<string, unknown>): string[] {
  const directImages = Array.isArray(product.images) ? product.images.filter(Boolean) as string[] : [];
  const imagePath = typeof product.image_path === "string" ? product.image_path : null;
  const singleImage =
    typeof product.image === "string"
      ? product.image
      : typeof product.image_url === "string"
      ? product.image_url
      : typeof product.photo === "string"
      ? product.photo
      : null;

  if (directImages.length > 0) return directImages;
  if (imagePath) return [imagePath];
  if (singleImage) return [singleImage];
  return [];
}

export function getProductPackageInfo(product: Partial<Product> & Record<string, unknown>): string {
  return typeof product.packageInfo === "string"
    ? product.packageInfo
    : typeof product.package_info === "string"
    ? product.package_info
    : "";
}

export function getProductWeight(product: Partial<Product> & Record<string, unknown>): number {
  return toNumber(product.weight ?? product.weight_kg ?? product.weightKg, 0);
}

export function getProductUnitPrice(product: Partial<Product> & Record<string, unknown>): number {
  return toNumber(product.employee_price ?? product.price, 0);
}

export function stampProductPrice<T extends Record<string, unknown>>(product: T, price: number): T & Product {
  return ({
    ...product,
    price,
    employee_price: price,
    customer_price: price,
    retail_price: price,
    wholesale_price: price,
    atacado_price: price,
    varejo_price: price,
  } as unknown) as T & Product;
}
