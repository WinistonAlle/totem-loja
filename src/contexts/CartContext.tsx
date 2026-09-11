// src/contexts/CartContext.tsx
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Product, CartItem } from "../types/products";
import { FREE_SHIPPING_THRESHOLD } from "../data/shipping";
import { APP_EVENT, subscribeAppEvent } from "@/lib/appEvents";
import { MIN_PACKAGES, MIN_WEIGHT_KG } from "@/data/products";
import { resolveProductPrice } from "@/utils/productPricing";
import { getCustomerSessionSnapshotOrNull } from "@/utils/customerSession";
import { getProductImages, getProductWeight, stampProductPrice, toBool, toNumber } from "@/utils/productData";

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

  /** Recalcula o preço de cada item pela própria quantidade dele — chame
   *  depois de qualquer mudança que não passe pelos setters daqui (ex:
   *  carregar o carrinho salvo do storage). */
  repriceCartFromPricingContext: () => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const useCart = (): CartContextType => {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used within a CartProvider");
  return context;
};

function normalizeProduct(raw: any): Product {
  const image_path = raw?.image_path ?? raw?.imagePath ?? null;

  return {
    ...raw,
    price: toNumber(raw?.price, 0),
    employee_price: toNumber(raw?.employee_price ?? raw?.employeePrice, 0),
    weight: getProductWeight(raw ?? {}),
    isPackage: toBool(raw?.isPackage ?? raw?.is_package ?? raw?.is_pkg),
    images: getProductImages(raw ?? {}),
    image_path,
  } as Product;
}

/* ===================== assinatura do cliente atual ===================== */

function getCustomerSignature(): string {
  const parsed = getCustomerSessionSnapshotOrNull<any>();
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
}

/**
 * Preço de UM item pela QUANTIDADE dele — não existe mais canal global
 * (varejo/atacado escolhido na tela inicial): cada produto vira atacado
 * sozinho, pela própria quantidade no carrinho (ver resolveLineChannel em
 * productPricing.ts).
 */
function resolvePriceForProduct(product: any, quantity: number) {
  return resolveProductPrice(product, quantity);
}

function stampPrice(product: any, price: number) {
  return stampProductPrice(product ?? {}, price) as Product;
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

    const unsubscribe = subscribeAppEvent(APP_EVENT.customerSessionChanged, updateSig);
    window.addEventListener("storage", onStorage);

    return () => {
      unsubscribe();
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
    setCartItems((prev) =>
      prev.map((item) => {
        const p = normalizeProduct(item.product);
        const qty = toNumber(item.quantity, 0);
        const nextPrice = resolvePriceForProduct(p, qty);
        const nextProduct = stampPrice(p, nextPrice);
        return { ...item, product: nextProduct };
      })
    );
  }, []);

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

  // Cada ação que muda quantidade repreça a linha pela quantidade RESULTANTE
  // — não pela quantidade sendo adicionada/removida sozinha. É o que faz um
  // pedido que já tinha 8 pacotes e ganha +2 virar atacado nos 10, em vez de
  // só o próximo pacote entrar com preço diferente do resto da linha.

  const addToCart = useCallback((product: Product, quantity: number = 1) => {
    const p0 = normalizeProduct(product);
    const qtyToAdd = Math.max(1, Math.floor(toNumber(quantity, 1)));

    setCartItems((prevItems) => {
      const existingItem = prevItems.find((item) => item.product.id === p0.id);
      const resultingQty = toNumber(existingItem?.quantity, 0) + qtyToAdd;
      const price = resolvePriceForProduct(p0, resultingQty);
      const p = stampPrice(p0, price);

      if (existingItem) {
        return prevItems.map((item) =>
          item.product.id === p.id ? { ...item, product: p, quantity: resultingQty } : item
        );
      }

      return [...prevItems, { product: p, quantity: resultingQty }];
    });

    setAnimateCartIcon((prev) => prev + 1);
  }, []);

  const addMultipleToCart = useCallback((products: { product: Product; quantity: number }[]) => {
    setCartItems((prevItems) => {
      const newItems = [...prevItems];

      products.forEach(({ product, quantity }) => {
        const p0 = normalizeProduct(product);
        const qtyToAdd = Math.max(1, Math.floor(toNumber(quantity, 1)));

        const idx = newItems.findIndex((item) => item.product.id === p0.id);
        const resultingQty = (idx >= 0 ? toNumber(newItems[idx].quantity, 0) : 0) + qtyToAdd;
        const price = resolvePriceForProduct(p0, resultingQty);
        const p = stampPrice(p0, price);

        if (idx >= 0) {
          newItems[idx] = { ...newItems[idx], product: p, quantity: resultingQty };
        } else {
          newItems.push({ product: p, quantity: resultingQty });
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
          if (newQty === 0) return null;

          const price = resolvePriceForProduct(item.product, newQty);
          const p = stampPrice(item.product, price);
          return { ...item, product: p, quantity: newQty };
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
      prevItems.map((item) => {
        if (item.product.id !== productId) return item;
        const price = resolvePriceForProduct(item.product, q);
        const p = stampPrice(item.product, price);
        return { ...item, product: p, quantity: q };
      })
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
