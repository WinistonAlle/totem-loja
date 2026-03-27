// src/contexts/CartContext.tsx
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Product, CartItem } from "../types/products";
import { FREE_SHIPPING_THRESHOLD } from "../data/shipping";
import { MIN_PACKAGES, MIN_WEIGHT_KG } from "@/data/products";

type CustomerType = "cpf" | "cnpj";
type ChannelType = "varejo" | "atacado";

interface CartContextType {
  cartItems: CartItem[];
  addToCart: (product: Product, quantity?: number) => void;
  decreaseQuantity: (productId: string) => void;
  removeFromCart: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;

  isCartOpen: boolean;
  toggleCart: () => void;
  openCart: () => void;
  closeCart: () => void;

  cartTotal: number;
  itemsCount: number;
  freeShippingRemaining: number;

  totalWeight: number;
  packageCount: number;
  meetsMinimumOrder: boolean;

  addMultipleToCart: (products: { product: Product; quantity: number }[]) => void;

  animateCartIcon: number;
  showFreeShippingAnimation: boolean;

  repriceCartFromPricingContext: () => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const useCart = (): CartContextType => {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used within a CartProvider");
  return context;
};

/* ===================== helpers: números/booleanos ===================== */

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const normalized = value.replace(",", ".").trim();
    const n = Number(normalized);
    return Number.isFinite(n) ? n : fallback;
  }

  return fallback;
}

function toBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (v === "true" || v === "1" || v === "sim" || v === "yes") return true;
    if (v === "false" || v === "0" || v === "nao" || v === "não" || v === "no") return false;
  }
  if (typeof value === "number") return value !== 0;
  return false;
}

/* ===================== normalizador do produto ===================== */

function normalizeProduct(raw: any): Product {
  const images = Array.isArray(raw?.images) ? raw.images.filter(Boolean) : [];
  const image_path = raw?.image_path ?? raw?.imagePath ?? null;

  return {
    ...raw,
    price: toNumber(raw?.price, 0),
    employee_price: toNumber(raw?.employee_price ?? raw?.employeePrice, 0),
    weight: toNumber(raw?.weight ?? raw?.weight_kg ?? raw?.weightKg, 0),
    isPackage: toBool(raw?.isPackage ?? raw?.is_package ?? raw?.is_pkg),
    images: images.length > 0 ? images : image_path ? [image_path] : [],
    image_path,
  } as Product;
}

/* ===================== assinatura do cliente atual ===================== */

function safeParseJSON(raw: string) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getCustomerSignature(): string {
  try {
    const raw = localStorage.getItem("customer_session");
    if (!raw) return "anon";

    const parsed = safeParseJSON(raw);
    const doc =
      parsed?.document ||
      parsed?.cpf ||
      parsed?.cnpj ||
      parsed?.customer?.document ||
      parsed?.customer?.cpf ||
      parsed?.customer?.cnpj ||
      parsed?.user?.document;

    if (doc && typeof doc === "string" && doc.trim().length > 0) return doc.trim();

    return "anon";
  } catch {
    return "anon";
  }
}

/* ===================== pricing context ===================== */

function getPricingContext(): { customer_type: CustomerType; channel: ChannelType } | null {
  try {
    const raw = localStorage.getItem("pricing_context");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const ct = parsed?.customer_type;
    const ch = parsed?.channel;
    if ((ct !== "cpf" && ct !== "cnpj") || (ch !== "varejo" && ch !== "atacado")) return null;
    return { customer_type: ct, channel: ch };
  } catch {
    return null;
  }
}

function resolvePriceForProduct(product: any, ctx: { customer_type: CustomerType; channel: ChannelType } | null) {
  const fallback = toNumber(product?.price ?? product?.employee_price ?? 0, 0);
  if (!ctx) return fallback;

  const key = `price_${ctx.customer_type}_${ctx.channel}`; // ex: price_cpf_varejo
  const raw = product?.[key];
  const n = toNumber(raw, NaN);

  if (Number.isFinite(n) && n > 0) return n;
  return fallback;
}

function stampPrice(product: any, price: number) {
  const p = { ...(product ?? {}) };
  p.price = price;
  p.employee_price = price;

  p.customer_price = price;
  p.retail_price = price;
  p.wholesale_price = price;
  p.atacado_price = price;
  p.varejo_price = price;

  return p as Product;
}

/* ===================== storage helpers ===================== */

function safeLoadCart(key: string): CartItem[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // valida minimamente
    return parsed
      .map((it: any) => {
        if (!it?.product?.id) return null;
        return { product: it.product, quantity: toNumber(it.quantity, 0) } as CartItem;
      })
      .filter(Boolean) as CartItem[];
  } catch {
    return [];
  }
}

function safeSaveCart(key: string, items: CartItem[]) {
  try {
    localStorage.setItem(key, JSON.stringify(items));
  } catch {}
}

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [customerSignature, setCustomerSignature] = useState<string>(() => {
    if (typeof window === "undefined") return "anon";
    return getCustomerSignature();
  });

  const cartStorageKey = useMemo(() => `cart_${customerSignature}`, [customerSignature]);

  const [cartItems, setCartItems] = useState<CartItem[]>(() => {
    if (typeof window === "undefined") return [];
    const sig = getCustomerSignature();
    return safeLoadCart(`cart_${sig}`);
  });

  const [isCartOpen, setIsCartOpen] = useState(false);
  const [animateCartIcon, setAnimateCartIcon] = useState(0);

  const showFreeShippingAnimation = false;

  // guarda a key anterior para migrar carrinho (anon -> doc, doc -> outro)
  const prevKeyRef = useRef<string>(cartStorageKey);

  // ✅ Atualiza assinatura quando customer_session muda
  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateSig = () => {
      const next = getCustomerSignature();
      setCustomerSignature(next);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === "customer_session") updateSig();
    };

    window.addEventListener("customer_session_changed" as any, updateSig);
    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener("customer_session_changed" as any, updateSig);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  // ✅ Quando a assinatura muda, carrega do storage e (se precisar) migra do carrinho anterior
  useEffect(() => {
    if (typeof window === "undefined") return;

    const prevKey = prevKeyRef.current;
    const nextKey = cartStorageKey;

    if (prevKey === nextKey) return;

    const nextItems = safeLoadCart(nextKey);

    if (nextItems.length > 0) {
      setCartItems(nextItems);
      setIsCartOpen(false);
      prevKeyRef.current = nextKey;
      return;
    }

    // se o próximo tá vazio, tenta migrar do anterior (ex.: anon -> doc)
    const prevItems = safeLoadCart(prevKey);

    if (prevItems.length > 0) {
      setCartItems(prevItems);
      setIsCartOpen(false);
      safeSaveCart(nextKey, prevItems);

      // opcional: remover o anterior pra não acumular lixo
      try {
        localStorage.removeItem(prevKey);
      } catch {}

      prevKeyRef.current = nextKey;
      return;
    }

    // ambos vazios -> só limpa state visual
    setCartItems([]);
    setIsCartOpen(false);
    prevKeyRef.current = nextKey;
  }, [cartStorageKey]);

  // ✅ Persistência: salva sempre que mudar
  useEffect(() => {
    if (typeof window === "undefined") return;
    safeSaveCart(cartStorageKey, cartItems);
  }, [cartItems, cartStorageKey]);

  /* ===================== ✅ REPRECIFICAÇÃO ===================== */

  const repriceCartFromPricingContext = useCallback(() => {
    const ctx = getPricingContext();

    setCartItems((prev) =>
      prev.map((item) => {
        const p = normalizeProduct(item.product);
        const nextPrice = resolvePriceForProduct(p, ctx);
        const nextProduct = stampPrice(p, nextPrice);
        return { ...item, product: nextProduct };
      })
    );
  }, []);

  useEffect(() => {
    const onPricing = () => repriceCartFromPricingContext();
    const onStorage = (e: StorageEvent) => {
      if (e.key === "pricing_context") onPricing();
    };
    window.addEventListener("pricing_context_changed" as any, onPricing);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("pricing_context_changed" as any, onPricing);
      window.removeEventListener("storage", onStorage);
    };
  }, [repriceCartFromPricingContext]);

  /* ===================== totais ===================== */

  const cartTotal = useMemo(() => {
    return cartItems.reduce((total, item) => {
      const price = toNumber((item.product as any)?.price, 0);
      const qty = toNumber(item.quantity, 0);
      return total + price * qty;
    }, 0);
  }, [cartItems]);

  const itemsCount = useMemo(() => {
    return cartItems.reduce((total, item) => total + toNumber(item.quantity, 0), 0);
  }, [cartItems]);

  const totalWeight = useMemo(() => {
    return cartItems.reduce((total, item) => {
      const w = (item.product as any)?.weight ?? (item.product as any)?.weight_kg ?? 0;
      const weight = toNumber(w, 0);
      const qty = toNumber(item.quantity, 0);
      return total + weight * qty;
    }, 0);
  }, [cartItems]);

  const packageCount = useMemo(() => {
    return cartItems.reduce((count, item) => {
      const isPkg = toBool((item.product as any)?.isPackage ?? (item.product as any)?.is_package);
      const qty = toNumber(item.quantity, 0);
      return isPkg ? count + qty : count;
    }, 0);
  }, [cartItems]);

  const meetsMinimumOrder = useMemo(() => {
    return packageCount >= MIN_PACKAGES || totalWeight >= MIN_WEIGHT_KG;
  }, [packageCount, totalWeight]);

  const freeShippingRemaining = useMemo(() => {
    return Math.max(0, FREE_SHIPPING_THRESHOLD - cartTotal);
  }, [cartTotal]);

  /* ===================== ações ===================== */

  const addToCart = useCallback((product: Product, quantity: number = 1) => {
    const p0 = normalizeProduct(product);

    const ctx = getPricingContext();
    const pr = resolvePriceForProduct(p0, ctx);
    const p = stampPrice(p0, pr);

    const qtyToAdd = Math.max(1, Math.floor(toNumber(quantity, 1)));

    setCartItems((prevItems) => {
      const existingItem = prevItems.find((item) => item.product.id === p.id);

      if (existingItem) {
        return prevItems.map((item) =>
          item.product.id === p.id ? { ...item, quantity: toNumber(item.quantity, 0) + qtyToAdd } : item
        );
      }

      return [...prevItems, { product: p, quantity: qtyToAdd }];
    });

    setAnimateCartIcon((prev) => prev + 1);
  }, []);

  const addMultipleToCart = useCallback((products: { product: Product; quantity: number }[]) => {
    const ctx = getPricingContext();

    setCartItems((prevItems) => {
      const newItems = [...prevItems];

      products.forEach(({ product, quantity }) => {
        const p0 = normalizeProduct(product);
        const pr = resolvePriceForProduct(p0, ctx);
        const p = stampPrice(p0, pr);

        const qtyToAdd = Math.max(1, Math.floor(toNumber(quantity, 1)));

        const idx = newItems.findIndex((item) => item.product.id === p.id);
        if (idx >= 0) {
          newItems[idx].quantity = toNumber(newItems[idx].quantity, 0) + qtyToAdd;
        } else {
          newItems.push({ product: p, quantity: qtyToAdd });
        }
      });

      return newItems;
    });

    setAnimateCartIcon((prev) => prev + 1);
    setIsCartOpen(true);
  }, []);

  const decreaseQuantity = useCallback((productId: string) => {
    setCartItems((prevItems) => {
      return prevItems
        .map((item) => {
          if (item.product.id !== productId) return item;

          const currentQty = toNumber(item.quantity, 0);
          const newQty = Math.max(0, currentQty - 1);

          return newQty === 0 ? null : { ...item, quantity: newQty };
        })
        .filter(Boolean) as CartItem[];
    });
  }, []);

  const removeFromCart = useCallback((productId: string) => {
    setCartItems((prevItems) => prevItems.filter((item) => item.product.id !== productId));
  }, []);

  const updateQuantity = useCallback((productId: string, quantity: number) => {
    const q = Math.floor(toNumber(quantity, 0));
    if (q <= 0) {
      removeFromCart(productId);
      return;
    }

    setCartItems((prevItems) =>
      prevItems.map((item) => (item.product.id === productId ? { ...item, quantity: q } : item))
    );
  }, [removeFromCart]);

  const clearCart = useCallback(() => {
    setCartItems([]);
    setIsCartOpen(false);

    try {
      if (typeof window !== "undefined") {
        localStorage.removeItem(cartStorageKey);
      }
    } catch {}
  }, [cartStorageKey]);

  const toggleCart = useCallback(() => setIsCartOpen((prev) => !prev), []);
  const openCart = useCallback(() => setIsCartOpen(true), []);
  const closeCart = useCallback(() => setIsCartOpen(false), []);

  const value = useMemo<CartContextType>(() => ({
    cartItems,
    addToCart,
    decreaseQuantity,
    removeFromCart,
    updateQuantity,
    clearCart,
    isCartOpen,
    toggleCart,
    openCart,
    closeCart,
    cartTotal,
    itemsCount,
    freeShippingRemaining,
    totalWeight,
    packageCount,
    meetsMinimumOrder,
    addMultipleToCart,
    animateCartIcon,
    showFreeShippingAnimation,
    repriceCartFromPricingContext,
  }), [
    addMultipleToCart,
    addToCart,
    animateCartIcon,
    cartItems,
    cartTotal,
    clearCart,
    closeCart,
    decreaseQuantity,
    freeShippingRemaining,
    isCartOpen,
    itemsCount,
    meetsMinimumOrder,
    openCart,
    packageCount,
    removeFromCart,
    repriceCartFromPricingContext,
    showFreeShippingAnimation,
    toggleCart,
    totalWeight,
    updateQuantity,
  ]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};
