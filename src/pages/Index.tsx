// src/pages/Index.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { APP_EVENT, emitAppEvent, subscribeAppEvent } from "@/lib/appEvents";
import type { Product } from "../types/products";
import ProductCard from "../components/ProductCard";
import CartToggle from "../components/CartToggle";
import Cart from "../components/Cart";
import { normalizeText as normalizeTextUtil } from "@/utils/stringUtils";
import { useCart } from "@/contexts/CartContext";
import { recordSystemEvent } from "@/lib/systemEvents";
import { getChannelBasePrice } from "@/utils/productPricing";
import { WHOLESALE_WEIGHT_THRESHOLD_KG, hasWholesaleAccess } from "@/utils/wholesaleRules";
import {
  getPricingContext,
  getPricingContextCustomerName,
  hasPricingContext,
  updatePricingContextCustomerName,
} from "@/utils/pricingContext";
import { clearCustomerSession, getCustomerSessionSnapshot } from "@/utils/customerSession";
import { clearAllCartKeysFromStorage } from "@/utils/cartStorage";

import {
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Bell,
  Package,
  LogOut,
  Filter,
  X,
  LayoutGrid,
  Keyboard,
  Delete,
  Space as SpaceIcon,
} from "lucide-react";
import logoGostinho from "@/images/logoc.png";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const CATEGORY_NAME_BY_ID: Record<number, string> = {
  1: "Pão de Queijo",
  2: "Salgados Assados",
  3: "Salgados P/ Fritar",
  4: "Pães e Massas Doces",
  5: "Biscoito de Queijo",
  6: "Salgados Grandes",
  7: "Alho em creme",
  8: "Outros",
};

const ITEMS_PER_PAGE = 24;
const PRODUCTS_CACHE_KEY = "gm_catalog_products_v4";
const PRODUCTS_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_CATALOG_DISPLAY_ORDER = 999999;
const TOTEM_NAME_KEYBOARD_ROWS = [
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["Z", "X", "C", "V", "B", "N", "M"],
];
const SEARCH_KEYBOARD_ROWS = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ...TOTEM_NAME_KEYBOARD_ROWS,
];

const ROUTES = {
  reports: "/relatorios",
  notices: "/avisos",
  featured: "/destaques",
  productsCrud: "/admin",
  start: "/inicio",
  contextoCompra: "/contexto",
};

/* --------------------------------------------------------
   HELPERS
-------------------------------------------------------- */
function useDebounce<T>(value: T, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

function normalizeForSearch(text: string) {
  const base = normalizeTextUtil(text ?? "");
  return base.replace(/\s+/g, "");
}

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
    if (["true", "1", "sim", "yes"].includes(v)) return true;
    if (["false", "0", "nao", "não", "no"].includes(v)) return false;
  }
  if (typeof value === "number") return value !== 0;
  return false;
}

function getCatalogDisplayOrder(product: any): number {
  const value = toNumber(product?.display_order, DEFAULT_CATALOG_DISPLAY_ORDER);
  return Number.isFinite(value) ? value : DEFAULT_CATALOG_DISPLAY_ORDER;
}

function sortCatalogProducts<T extends Record<string, any>>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const orderDiff = getCatalogDisplayOrder(a) - getCatalogDisplayOrder(b);
    if (orderDiff !== 0) return orderDiff;
    return String(a?.name ?? "").localeCompare(String(b?.name ?? ""), "pt-BR");
  });
}

function isMissingRelation(err: any) {
  const msg = String(err?.message ?? "");
  return (
    err?.code === "42P01" ||
    msg.toLowerCase().includes("does not exist") ||
    msg.toLowerCase().includes("relation")
  );
}

function pickDisplayName(session: any): string {
  const candidates = [
    session?.name,
    session?.nome,
    session?.full_name,
    session?.fullName,
    session?.first_name,
    session?.firstname,
    session?.display_name,
    session?.displayName,
    session?.email,
    session?.cpf,
    session?.cnpj,
  ]
    .map((v: any) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean);

  const raw = candidates[0] || "Cliente";
  const first = raw.split(/\s+/).filter(Boolean)[0] || raw;
  return first.charAt(0).toUpperCase() + first.slice(1);
}

function scrollCatalogToTop() {
  const targets = [
    document.scrollingElement,
    document.documentElement,
    document.body,
    window,
  ].filter(Boolean) as Array<Element | Window>;

  targets.forEach((target) => {
    if ("scrollTo" in target) {
      target.scrollTo({ top: 0, left: 0, behavior: "smooth" });
    }
  });
}

function getChannelLabel(channel: ChannelType | null | undefined): string {
  return channel === "atacado" ? "ATACADO" : "VAREJO";
}

function getCustomerTypeForChannel(channel: ChannelType): CustomerType {
  return channel === "atacado" ? "cnpj" : "cpf";
}

function buildPricingContext(channel: ChannelType) {
  const customer_type = getCustomerTypeForChannel(channel);
  return {
    customer_type,
    channel,
    price_table: `${channel.toUpperCase()}_${customer_type.toUpperCase()}`,
    created_at: new Date().toISOString(),
    customer_name: getPricingContextCustomerName(),
  };
}

type CustomerType = "cpf" | "cnpj";
type ChannelType = "varejo" | "atacado";

/* --------------------------------------------------------
   TYPES
-------------------------------------------------------- */
interface Notice {
  id: string;
  title: string;
  body: string;
  created_at?: string;
  image_url?: string | null;
}

type ProductsCachePayload = {
  version: number;
  cachedAt: number;
  items: Product[];
};

/* --------------------------------------------------------
   PAGE
-------------------------------------------------------- */
const Index: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const { clearCart, closeCart, repriceCartFromPricingContext, totalWeight } = useCart();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearchTerm = useDebounce(searchTerm, 400);

  const [selectedCategory, setSelectedCategory] = useState<string | "all">("all");
  const [currentPage, setCurrentPage] = useState(1);

  const [notices, setNotices] = useState<Notice[]>([]);
  const [currentNoticeIndex, setCurrentNoticeIndex] = useState(0);

  const [sessionTick, setSessionTick] = useState(0);
  const [pricingTick, setPricingTick] = useState(0);
  const [productsRefreshTick, setProductsRefreshTick] = useState(0);

  // ✅ Mobile bottom-sheet (categorias + menu)
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetTab, setSheetTab] = useState<"categorias" | "menu">("categorias");
  const [nameModalOpen, setNameModalOpen] = useState(false);
  const [totemCustomerName, setTotemCustomerName] = useState("");
  const [nameModalError, setNameModalError] = useState("");
  const [searchKeyboardOpen, setSearchKeyboardOpen] = useState(false);
  const [showScrollTopHint, setShowScrollTopHint] = useState(false);

  // ✅ trava scroll do body quando o sheet abrir (mobile fica “no lugar”)
  useEffect(() => {
    if (!sheetOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [sheetOpen]);

  useEffect(() => {
    if (!searchKeyboardOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("[data-search-keyboard='1']")) return;
      if (target.closest("[data-search-input='1']")) return;
      setSearchKeyboardOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [searchKeyboardOpen]);

  useEffect(() => {
    if (!nameModalOpen) return;
    setSearchKeyboardOpen(false);
  }, [nameModalOpen]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "customer_session") setSessionTick((t) => t + 1);
      if (e.key === "pricing_context") setPricingTick((t) => t + 1);
      if (e.key === PRODUCTS_CACHE_KEY) setProductsRefreshTick((t) => t + 1);
    };
    window.addEventListener("storage", onStorage);

    const onLocal = () => setSessionTick((t) => t + 1);
    const unsubscribeSession = subscribeAppEvent(APP_EVENT.customerSessionChanged, onLocal);

    const onPricing = () => setPricingTick((t) => t + 1);
    const unsubscribePricing = subscribeAppEvent(APP_EVENT.pricingContextChanged, onPricing);
    const onProductsChanged = () => setProductsRefreshTick((t) => t + 1);
    const unsubscribeProducts = subscribeAppEvent(APP_EVENT.catalogProductsChanged, onProductsChanged);

    return () => {
      window.removeEventListener("storage", onStorage);
      unsubscribeSession();
      unsubscribePricing();
      unsubscribeProducts();
    };
  }, []);

  void sessionTick;
  const session = getCustomerSessionSnapshot() as any;

  const isLoggedIn = useMemo(() => {
    return Boolean(
      session?.id ||
        session?.customer_id ||
        session?.user_id ||
        session?.cpf ||
        session?.cnpj ||
        session?.email
    );
  }, [session]);

  const typedCustomerName = getPricingContextCustomerName();
  const displayName = useMemo(() => {
    return typedCustomerName || pickDisplayName(session);
  }, [session, typedCustomerName]);
  const shouldShowDisplayName = Boolean(displayName && (isLoggedIn || typedCustomerName));
  const isAdmin = useMemo(() => String(session?.role ?? "").toLowerCase() === "admin", [session]);

  const isActiveRoute = (path: string) => {
    const cur = location?.pathname ?? "";
    if (!path) return false;
    return cur === path || cur.startsWith(path + "/");
  };

  const resetTotemSessionAndGoStart = () => {
    try {
      closeCart();
      clearCart();
      clearAllCartKeysFromStorage();

      localStorage.removeItem("pricing_context");
      clearCustomerSession();
      emitAppEvent(APP_EVENT.pricingContextChanged);
    } catch {}
    navigate(ROUTES.start, { replace: true });
  };

  const handleLogout = () => resetTotemSessionAndGoStart();

  useEffect(() => {
    if (isAdmin) return;
    if (!hasPricingContext()) navigate(ROUTES.contextoCompra, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, productsRefreshTick]);

  useEffect(() => {
    if (isAdmin) {
      setNameModalOpen(false);
      setNameModalError("");
      return;
    }
    if (!hasPricingContext()) return;
    const savedName = getPricingContextCustomerName();
    setTotemCustomerName(savedName);
    setNameModalOpen(!savedName);
  }, [isAdmin, pricingTick]);

  const handleConfirmTotemName = () => {
    const trimmed = totemCustomerName.trim();
    if (!trimmed) {
      setNameModalError("Digite seu nome para continuar.");
      return;
    }

    updatePricingContextCustomerName(trimmed);
    setNameModalError("");
    setNameModalOpen(false);
  };

  const handleNameKeyPress = (key: string) => {
    setNameModalError("");
    setTotemCustomerName((current) => {
      if (current.length >= 80) return current;
      if (key === "SPACE") {
        if (!current || current.endsWith(" ")) return current;
        return `${current} `;
      }

      return `${current}${key}`;
    });
  };

  const handleNameBackspace = () => {
    setNameModalError("");
    setTotemCustomerName((current) => current.slice(0, -1));
  };

  const handleSearchKeyPress = (key: string) => {
    setSearchTerm((current) => {
      if (current.length >= 80) return current;
      if (key === "SPACE") {
        if (!current || current.endsWith(" ")) return current;
        return `${current} `;
      }
      return `${current}${key}`;
    });
  };

  const handleSearchBackspace = () => {
    setSearchTerm((current) => current.slice(0, -1));
  };

  /* --------------------------------------------------------
     ✅ NAV SAFE
  -------------------------------------------------------- */
  const safeNavigate = (path: string) => {
    if (nameModalOpen) return;
    try {
      closeCart();
    } catch {}
    if (!path) return;
    const cur = location?.pathname ?? "";
    if (cur === path || cur.startsWith(path + "/")) return;
    navigate(path);
  };

  /* --------------------------------------------------------
     SWITCH ATACADO/VAREJO
  -------------------------------------------------------- */
  void pricingTick;
  const pricingCtx = getPricingContext();

  const applyPricingChannel = useCallback((nextChannel: ChannelType) => {
    const next = buildPricingContext(nextChannel);

    try {
      localStorage.setItem("pricing_context", JSON.stringify(next));
      emitAppEvent(APP_EVENT.pricingContextChanged);
    } catch {}

    repriceCartFromPricingContext();
  }, [repriceCartFromPricingContext]);

  const handleToggleChannel = () => {
    const ctx = getPricingContext();
    if (!ctx) {
      navigate(ROUTES.contextoCompra, { replace: true });
      return;
    }

    const nextChannel: ChannelType = ctx.channel === "varejo" ? "atacado" : "varejo";
    applyPricingChannel(nextChannel);
  };

  useEffect(() => {
    if (!pricingCtx) return;

    // Mantem a troca manual do toggle.
    // A automacao aqui so promove para atacado quando o peso minimo e atingido.
    if (totalWeight < WHOLESALE_WEIGHT_THRESHOLD_KG) return;
    if (pricingCtx.channel === "atacado") return;

    applyPricingChannel("atacado");
  }, [applyPricingChannel, pricingCtx, totalWeight]);

  const SwitchPricing: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
    if (!pricingCtx) return null;
    const isAtacado = pricingCtx.channel === "atacado";
    const wholesaleUnlocked = hasWholesaleAccess(totalWeight);
    const progressToWholesale = Math.min(
      (Math.max(Number(totalWeight ?? 0), 0) / WHOLESALE_WEIGHT_THRESHOLD_KG) * 100,
      100
    );
    const remainingKg = Math.max(WHOLESALE_WEIGHT_THRESHOLD_KG - Number(totalWeight ?? 0), 0);

    return (
      <div
        className={[
          "rounded-2xl border border-gray-200 bg-white shadow-sm",
          compact ? "p-3" : "p-4",
        ].join(" ")}
      >
        <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div
                className={[
                  "font-extrabold text-gray-900 leading-tight",
                  compact ? "text-[18px]" : "text-[22px]",
              ].join(" ")}
            >
              {isAtacado ? "ATACADO" : "VAREJO"}
              </div>
              <div className={[compact ? "text-[13px]" : "text-[15px]", "text-gray-500 font-semibold"].join(" ")}>
                {isAtacado && wholesaleUnlocked
                  ? "Tabela de atacado liberada para este pedido"
                  : `Faltam ${remainingKg.toFixed(1).replace(".", ",")}kg para liberar o atacado`}
              </div>
            </div>

          <label
            className={[
              "relative inline-block shrink-0",
              compact ? "h-[42px] w-[76px]" : "h-[46px] w-[84px]",
            ].join(" ")}
            aria-label="Alternar canal"
          >
            <input
              type="checkbox"
              className="peer sr-only"
              checked={isAtacado}
              onChange={handleToggleChannel}
            />
            <span
              className={[
                "absolute inset-0 cursor-pointer rounded-full border transition-all duration-300",
                "bg-[#f6f7fb] border-[#d7dce5] shadow-[inset_0_1px_2px_rgba(15,23,42,0.08)]",
                "peer-checked:border-[#52d24d] peer-checked:bg-[#52d24d]",
                "peer-focus-visible:ring-4 peer-focus-visible:ring-[#52d24d]/20",
              ].join(" ")}
            />
            <span
              className={[
                "pointer-events-none absolute top-1/2 left-[4px] -translate-y-1/2 rounded-full bg-white",
                "shadow-[0_8px_18px_rgba(15,23,42,0.18),0_1px_2px_rgba(15,23,42,0.08)] ring-1 ring-black/5",
                "transition-transform duration-300 ease-out",
                compact
                  ? "h-[34px] w-[34px] peer-checked:translate-x-[34px]"
                  : "h-[38px] w-[38px] peer-checked:translate-x-[38px]",
              ].join(" ")}
            />
          </label>
        </div>

        <div className={compact ? "mt-3" : "mt-4"}>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[12px] font-bold uppercase tracking-[0.08em] text-gray-500">
              {wholesaleUnlocked ? "Atacado liberado" : "Progresso para atacado"}
            </span>
            <span
              className={`text-[12px] font-black uppercase tracking-[0.08em] ${
                wholesaleUnlocked ? "text-emerald-700" : "text-[#9e0f14]"
              }`}
            >
              {wholesaleUnlocked ? "15kg atingidos" : `${Math.round(progressToWholesale)}%`}
            </span>
          </div>

          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-gray-100 ring-1 ring-black/5">
            <div
              className="h-full rounded-full transition-[width] duration-500 ease-out"
              style={{
                width: `${progressToWholesale}%`,
                background: wholesaleUnlocked
                  ? "linear-gradient(90deg, #187468 0%, #26a97c 58%, #8ee2bf 100%)"
                  : "linear-gradient(90deg, #9e0f14 0%, #cb4155 52%, #efb788 100%)",
              }}
            />
          </div>
        </div>
      </div>
    );
  };

  /* --------------------------------------------------------
     NOTICES
  -------------------------------------------------------- */
  useEffect(() => {
    let mounted = true;

    async function loadNotices() {
      try {
        const { data, error } = await supabase
          .from("notices")
          .select("id, title, body, created_at, is_published, image_url")
          .eq("is_published", true)
          .order("created_at", { ascending: false });

        if (!mounted) return;

        if (error) {
          if (isMissingRelation(error)) {
            setNotices([]);
            return;
          }
          setNotices([]);
          return;
        }

        setNotices(
          ((data as any[]) ?? []).map((n: any) => ({
            id: n.id,
            title: n.title,
            body: n.body,
            created_at: n.created_at,
            image_url: n.image_url ?? null,
          }))
        );
      } catch {
        if (!mounted) return;
        setNotices([]);
      }
    }

    loadNotices();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (notices.length <= 1) {
      setCurrentNoticeIndex(0);
      return;
    }
    const interval = setInterval(() => {
      setCurrentNoticeIndex((p) => (p + 1) % notices.length);
    }, 7000);
    return () => clearInterval(interval);
  }, [notices]);

  const currentNotice = notices.length ? notices[currentNoticeIndex] : null;

  /* --------------------------------------------------------
     PRODUCTS
  -------------------------------------------------------- */
  function mapRowToProduct(row: any): Product {
    const varejoBasePrice = getChannelBasePrice(row, "varejo");
    const atacadoBasePrice = getChannelBasePrice(row, "atacado");

    const price_cpf_atacado = toNumber(row.price_cpf_atacado, 0);
    const price_cpf_varejo = toNumber(row.price_cpf_varejo, 0);
    const price_cnpj_atacado = toNumber(row.price_cnpj_atacado, 0);
    const price_cnpj_varejo = toNumber(row.price_cnpj_varejo, 0);

    const categoryName =
      CATEGORY_NAME_BY_ID[toNumber(row.category_id, -1)] ??
      row.category ??
      row.category_name ??
      "Outros";

    const imagesFromRow = Array.isArray(row.images) ? row.images.filter(Boolean) : [];
    const imagePath = row.image_path ?? row.imagePath ?? null;
    const singleImage = row.image ?? row.image_url ?? row.photo ?? null;

    const images =
      imagesFromRow.length > 0
        ? imagesFromRow
        : imagePath
        ? [imagePath]
        : singleImage
        ? [singleImage]
        : [];

    const p: any = {
      id: String(row.id),
      old_id: row.old_id ?? null,
      name: row.name ?? "",
      display_order: toNumber(row.display_order, DEFAULT_CATALOG_DISPLAY_ORDER),
      price: varejoBasePrice,
      employee_price: atacadoBasePrice,
      images,
      image_path: imagePath,
      category: categoryName as any,
      description: row.description ?? "",
      packageInfo: row.packageInfo ?? row.package_info ?? "",
      weight: toNumber(row.weight ?? row.weight_kg ?? 0, 0),
      isPackage: toBool(row.isPackage ?? row.is_package ?? false),
      featured: toBool(row.featured ?? row.is_featured ?? false),
      inStock: toBool(row.inStock ?? row.in_stock ?? true),
      isLaunch: toBool(row.isLaunch ?? row.is_launch ?? false),
      extraInfo: row.extraInfo ?? undefined,

      price_cpf_atacado,
      price_cpf_varejo,
      price_cnpj_atacado,
      price_cnpj_varejo,
    };

    return p as Product;
  }

  useEffect(() => {
    let mounted = true;
    let cacheServed = false;

    try {
      const cached = localStorage.getItem(PRODUCTS_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as ProductsCachePayload | Product[];
        const now = Date.now();
        const isLegacyCache = Array.isArray(parsed);
        const cacheItems = isLegacyCache ? parsed : parsed?.items;
        const cachedAt = isLegacyCache ? 0 : Number(parsed?.cachedAt ?? 0);
        const isFresh = now - cachedAt <= PRODUCTS_CACHE_TTL_MS;

        if (Array.isArray(cacheItems) && cacheItems.length > 0 && isFresh) {
          setProducts(sortCatalogProducts(cacheItems as Product[]));
          setLoading(false);
          cacheServed = true;
          void recordSystemEvent({
            eventName: "catalog_cache_hit",
            severity: "info",
            message: "Catalogo carregado do cache local.",
            payload: {
              items: cacheItems.length,
              cacheAgeMs: now - cachedAt,
            },
          });
        } else {
          localStorage.removeItem(PRODUCTS_CACHE_KEY);
        }
      }
    } catch {}

    async function loadProducts() {
      const startedAt = Date.now();

      try {
        setLoading(true);

        const { data, error } = await supabase
          .from("products")
          .select("*")
          .order("display_order", { ascending: true })
          .order("name", { ascending: true });

        if (!mounted) return;

        if (error) {
          if (isMissingRelation(error)) {
            setProducts([]);
            setLoadError('Tabela "products" ainda não existe nesse banco (ou está sem acesso).');
            void recordSystemEvent({
              eventName: "catalog_load_failure",
              severity: "error",
              message: 'Tabela "products" indisponivel para o totem.',
            });
            return;
          }
          setLoadError(error.message);
          void recordSystemEvent({
            eventName: "catalog_load_failure",
            severity: "error",
            message: error.message,
          });
          return;
        }

        const mapped: Product[] = sortCatalogProducts(((data as any[]) ?? []).map(mapRowToProduct));
        setProducts(mapped);
        setLoadError(null);
        void recordSystemEvent({
          eventName: "catalog_load_success",
          severity: "info",
          message: cacheServed
            ? "Catalogo atualizado em segundo plano apos uso do cache local."
            : "Catalogo carregado do banco com sucesso.",
          payload: {
            items: mapped.length,
            durationMs: Date.now() - startedAt,
            cacheServed,
          },
        });

        try {
          const payload: ProductsCachePayload = {
            version: 2,
            cachedAt: Date.now(),
            items: mapped,
          };
          localStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify(payload));
        } catch {}
      } catch (err: any) {
        if (!mounted) return;
        setLoadError(String(err?.message ?? err));
        void recordSystemEvent({
          eventName: "catalog_load_failure",
          severity: "error",
          message: String(err?.message ?? err ?? "Falha ao carregar catalogo."),
          payload: {
            durationMs: Date.now() - startedAt,
          },
        });
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadProducts();
    return () => {
      mounted = false;
    };
  }, []);

  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => p.category && set.add(p.category));
    const list = Array.from(set).filter((category) => category !== "Salgados Grandes");
    return list.length ? list : Object.values(CATEGORY_NAME_BY_ID);
  }, [products]);

  const filtered = useMemo(() => {
    const termNorm = normalizeForSearch(debouncedSearchTerm).trim();
    const globalSearchActive = !!termNorm;

    return products.filter((p) => {
      const nameNorm = normalizeForSearch(p.name);
      const idNorm = normalizeForSearch(String(p.id));
      const oldIdNorm =
        p.old_id !== undefined && p.old_id !== null ? normalizeForSearch(String(p.old_id)) : "";

      const matchesSearch =
        !globalSearchActive ||
        nameNorm.includes(termNorm) ||
        idNorm.includes(termNorm) ||
        (oldIdNorm && oldIdNorm.includes(termNorm));

      const matchesCategory =
        selectedCategory === "all"
          ? true
          : normalizeForSearch(p.category || "") === normalizeForSearch(selectedCategory);

      return matchesSearch && matchesCategory;
    });
  }, [products, debouncedSearchTerm, selectedCategory]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginated = useMemo(
    () => filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE),
    [filtered, currentPage]
  );

  useEffect(() => setCurrentPage(1), [debouncedSearchTerm, selectedCategory]);
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  useEffect(() => {
    const updateScrollHint = () => {
      setShowScrollTopHint(window.scrollY > 240);
    };

    updateScrollHint();
    window.addEventListener("scroll", updateScrollHint, { passive: true });
    return () => window.removeEventListener("scroll", updateScrollHint);
  }, []);

  const changePage = (nextPage: number) => {
    const p = Math.max(1, Math.min(totalPages, nextPage));
    setCurrentPage(p);
    requestAnimationFrame(scrollCatalogToTop);
    setTimeout(scrollCatalogToTop, 0);
  };

  /* UI helpers */
  const selectableBtn = (active: boolean) =>
    `
      w-full rounded-2xl px-4 py-[18px] text-left
      border transition-all duration-200
      flex items-center gap-3
      ${
        active
          ? "bg-gradient-to-br from-gray-950 via-gray-900 to-gray-800 text-white border-black/30 ring-2 ring-black/10 scale-[1.01]"
          : "bg-white border-gray-200 text-gray-900 hover:bg-gray-50"
      }
      active:scale-[0.99]
    `;

  const categoryBtnClass = (active: boolean) =>
    `
      w-full rounded-2xl px-4 py-[18px] text-left border
      transition-all duration-200
      ${
        active
          ? "bg-gradient-to-br from-gray-100 via-gray-200 to-gray-300 text-gray-900 border-gray-300 ring-2 ring-black/10 scale-[1.02] font-extrabold shadow-sm"
          : "bg-white border-gray-200 text-gray-800 hover:bg-gray-50 font-semibold"
      }
      active:scale-[0.99]
    `;

  const authActionBtn = (variant: "login" | "signup") =>
    `
      w-full rounded-2xl px-4 py-[18px] text-left
      border transition-all duration-200
      flex items-center gap-3
      active:scale-[0.99]
      ${
        variant === "login"
          ? "bg-[#9E0F14] text-white border-[#9E0F14] hover:brightness-95 shadow-sm"
          : "bg-[#4a505a] text-white border-[#4a505a] hover:bg-[#424854] shadow-sm"
      }
    `;

  const openSheet = (tab: "categorias" | "menu") => {
    setSheetTab(tab);
    setSheetOpen(true);
  };

  const selectedCategoryLabel = selectedCategory === "all" ? "Todos" : selectedCategory;

  return (
    <div
      className="min-h-screen bg-[#f6f7f9]"
      style={{
        touchAction: "pan-y",
        overscrollBehavior: "none",
        WebkitUserSelect: "none",
        userSelect: "none",
      }}
    >
      <Dialog open={nameModalOpen}>
        <DialogContent className="w-[min(99.4vw,1280px)] max-w-none rounded-[24px] border-white/50 bg-white/94 p-0 shadow-[0_30px_80px_rgba(32,12,12,0.24)] sm:rounded-[34px]">
          <div className="rounded-[24px] border border-white/40 bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(255,245,241,0.58))] p-4 sm:rounded-[34px] sm:p-10">
            <DialogHeader className="text-center">
              <DialogTitle className="mt-0 text-[28px] font-black tracking-[-0.03em] text-[#5d1717] sm:text-[42px]">
                Identifique seu pedido
              </DialogTitle>
              <p className="mt-2 text-[14px] font-semibold text-[#6a1f1f]/70 sm:text-[18px]">
                Digite seu nome para continuar
              </p>
            </DialogHeader>

            <div className="mt-4 rounded-[18px] border border-white/40 bg-white/88 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] sm:mt-7 sm:rounded-[28px] sm:p-5">
              <label htmlFor="totem-name-modal" className="mb-2 block text-center text-[16px] font-extrabold text-[#6a1f1f] sm:mb-4 sm:text-[22px]">
                Digite seu nome:
              </label>
              <Input
                id="totem-name-modal"
                data-testid="totem-name-input"
                value={totemCustomerName}
                onChange={(e) => {
                  setTotemCustomerName(e.target.value);
                  if (nameModalError) setNameModalError("");
                }}
                maxLength={80}
                readOnly={typeof window !== "undefined" ? window.innerWidth >= 640 : true}
                className="h-16 rounded-[18px] border-white/50 bg-white/85 px-3 text-center !text-[29px] font-black !leading-none text-[#631919] sm:h-32 sm:rounded-[28px] sm:px-8 sm:!text-[79px] md:!text-[79px]"
              />
            </div>

            <div className="mt-3 space-y-2 max-sm:hidden sm:mt-6 sm:space-y-4">
              <div className="space-y-2 sm:space-y-4">
                {TOTEM_NAME_KEYBOARD_ROWS.map((row, rowIndex) => (
                  <div
                    key={rowIndex}
                    className={`grid gap-2 sm:gap-3 ${
                      rowIndex === 1
                        ? "grid-cols-9 px-0 sm:px-1"
                        : rowIndex === 2
                        ? "grid-cols-7 px-1 sm:px-3"
                        : "grid-cols-10"
                    }`}
                  >
                    {row.map((key) => (
                      <button
                        key={key}
                        type="button"
                        data-testid={`totem-name-key-${key}`}
                        onClick={() => handleNameKeyPress(key)}
                        className="h-[72px] rounded-[18px] border border-white/50 bg-white/92 text-[24px] font-black text-[#6a1f1f] shadow-[0_10px_20px_rgba(0,0,0,0.08)] active:scale-[0.97] sm:h-[104px] sm:rounded-[24px] sm:text-[38px]"
                      >
                        {key}
                      </button>
                    ))}
                  </div>
                ))}

                <div className="grid grid-cols-[1.5fr_3.2fr] gap-2 sm:gap-3">
                  <button
                    type="button"
                    data-testid="totem-name-backspace"
                    onClick={handleNameBackspace}
                    className="h-[72px] rounded-[18px] border border-white/50 bg-white/92 px-3 text-[20px] font-extrabold text-[#6a1f1f] shadow-[0_10px_20px_rgba(0,0,0,0.08)] active:scale-[0.97] sm:h-[104px] sm:rounded-[24px] sm:text-[32px]"
                  >
                    Apagar
                  </button>
                  <button
                    type="button"
                    data-testid="totem-name-space"
                    onClick={() => handleNameKeyPress("SPACE")}
                    className="h-[72px] rounded-[18px] border border-white/50 bg-white/92 text-[20px] font-extrabold text-[#6a1f1f] shadow-[0_10px_20px_rgba(0,0,0,0.08)] active:scale-[0.97] sm:h-[104px] sm:rounded-[24px] sm:text-[32px]"
                  >
                    Espaço
                  </button>
                </div>
              </div>
            </div>

            {nameModalError ? (
              <p className="mt-4 text-center text-[15px] font-extrabold text-[#b42318] sm:text-[18px]">{nameModalError}</p>
            ) : null}

            <div className="mt-4 grid grid-cols-2 gap-2 sm:mt-6 sm:gap-3">
              <button
                type="button"
                data-testid="totem-name-clear"
                onClick={() => {
                  setTotemCustomerName("");
                  setNameModalError("");
                }}
                className="h-12 rounded-[16px] border border-white/50 bg-white/92 text-[14px] font-extrabold text-[#6a1f1f] shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] active:scale-[0.98] sm:h-[72px] sm:rounded-[22px] sm:text-[20px]"
              >
                Limpar
              </button>
              <button
                type="button"
                data-testid="totem-name-confirm"
                onClick={handleConfirmTotemName}
                className="h-12 rounded-[16px] bg-[linear-gradient(180deg,#c22b2b_0%,#7f0b0f_100%)] text-[14px] font-extrabold text-white shadow-[0_18px_32px_rgba(126,11,15,0.28)] active:scale-[0.98] sm:h-[72px] sm:rounded-[22px] sm:text-[20px]"
              >
                Entrar no catálogo
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* AVISOS (mobile mais proporcional) */}
      <section className="w-full">
        <div className="h-[200px] sm:h-[280px] lg:h-[384px] w-full bg-gray-100 overflow-hidden">
          {currentNotice?.image_url ? (
            <img
              src={currentNotice.image_url}
              alt={currentNotice.title || "Aviso"}
              className="h-full w-full object-cover"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <div className="h-full w-full grid place-items-center text-gray-400 font-semibold">
              <img src={logoGostinho} alt="GM" className="h-14 sm:h-16 opacity-80" />
            </div>
          )}
        </div>
      </section>

      {/* header sticky: busca + ações mobile (arrumado) */}
      <div className="sticky top-0 z-40 bg-[#f6f7f9] px-4 sm:px-5 pt-4 sm:pt-5 pb-4 sm:pb-5 border-b border-black/5">
        <div className="grid grid-cols-1 gap-3">
          <div className="relative">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-6 w-6 text-gray-400" />
            <Input
              data-testid="catalog-search-input"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onClick={() => {
                if (typeof window !== "undefined" && window.innerWidth >= 640) {
                  setSearchKeyboardOpen(true);
                }
              }}
              onFocus={() => {
                if (typeof window !== "undefined" && window.innerWidth >= 640) {
                  setSearchKeyboardOpen(true);
                }
              }}
              placeholder="Buscar produto (nome ou código)..."
              className="
                h-15 sm:h-[72px] pl-14 sm:pl-16 pr-14 sm:pr-16
                rounded-[24px] sm:rounded-[28px]
                bg-white border border-gray-200/90
                shadow-[0_14px_30px_rgba(0,0,0,0.07)]
                text-[16px] sm:text-[18px] font-semibold text-gray-900
                placeholder:text-gray-400
                focus-visible:ring-2 focus-visible:ring-black/10
              "
              inputMode="search"
              readOnly={typeof window !== "undefined" ? window.innerWidth >= 640 : true}
              data-search-input="1"
            />
            {searchTerm ? (
              <button
                type="button"
                data-testid="catalog-search-clear"
                onClick={() => setSearchTerm("")}
                className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 h-9 w-9 sm:h-11 sm:w-11 rounded-full border border-gray-200 bg-white text-gray-500 shadow-[0_8px_18px_rgba(0,0,0,0.08)] hover:text-gray-700 active:scale-[0.97]"
                aria-label="Limpar busca"
              >
                <X className="h-4 w-4 sm:h-5 sm:w-5 mx-auto" />
              </button>
            ) : null}
          </div>

          {/* ✅ Mobile toolbar: bem alinhada e “clean” */}
          <div className="lg:hidden">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => openSheet("categorias")}
                className="
                  h-11 px-4 rounded-2xl
                  bg-white border border-gray-200
                  shadow-[0_8px_18px_rgba(0,0,0,0.06)]
                  flex items-center gap-2
                  font-extrabold text-[14px]
                  active:scale-[0.98]
                "
              >
                <LayoutGrid className="h-4 w-4" />
                Categorias
              </button>

              <button
                type="button"
                onClick={() => openSheet("menu")}
                className="
                  h-11 px-4 rounded-2xl
                  bg-white border border-gray-200
                  shadow-[0_8px_18px_rgba(0,0,0,0.06)]
                  flex items-center gap-2
                  font-extrabold text-[14px]
                  active:scale-[0.98]
                "
                title="Menu"
              >
                <Filter className="h-4 w-4" />
                Menu
              </button>

              <div className="flex-1 min-w-0">
                <div className="h-11 px-3 rounded-2xl border border-gray-200 bg-white shadow-[0_8px_18px_rgba(0,0,0,0.04)] flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[11px] text-gray-500 font-semibold leading-none">Categoria</div>
                    <div className="text-[13px] font-extrabold text-gray-900 truncate">
                      {selectedCategoryLabel}
                    </div>
                  </div>

                  {selectedCategory !== "all" && (
                    <button
                      type="button"
                      onClick={() => setSelectedCategory("all")}
                      className="h-8 px-3 rounded-xl border border-gray-200 bg-gray-50 hover:bg-gray-100 font-extrabold text-[12px] active:scale-[0.98]"
                      title="Limpar filtro"
                    >
                      Limpar
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <main className="px-4 sm:px-5 pb-[calc(220px+env(safe-area-inset-bottom))] sm:pb-[220px]">
        {loadError && (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700 font-semibold">
            Erro: {loadError}
          </div>
        )}

        {shouldShowDisplayName && (
          <div className="mb-4 rounded-2xl border border-gray-200 bg-gradient-to-br from-white via-gray-50 to-gray-100 px-4 py-4 shadow-sm">
            <div className="text-[20px] sm:text-[22px] font-extrabold leading-tight text-gray-900">
              <span className="mr-1">OLÁ,</span>
              <span className="text-gray-900">{displayName}</span>
              <span className="text-[#9E0F14]">!</span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 lg:gap-6 items-start">
          {/* Sidebar (desktop) */}
          <aside className="hidden lg:block self-start sticky top-[112px] h-[calc(100dvh-128px)]">
            <div className="h-full rounded-[26px] border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col">
              <div className="p-4 flex flex-col gap-3">
                <SwitchPricing />

                {isAdmin && (
                  <>
                    <div className="h-px bg-gray-100 my-1" />
                    <div className="flex flex-col gap-3">
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          safeNavigate(ROUTES.notices);
                        }}
                        type="button"
                        className={selectableBtn(isActiveRoute(ROUTES.notices))}
                      >
                        <span className="shrink-0">
                          <Bell className="h-5 w-5" />
                        </span>
                        <span className="text-[20px] font-extrabold line-clamp-1">Avisos</span>
                      </button>

                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          safeNavigate(ROUTES.productsCrud);
                        }}
                        type="button"
                        className={selectableBtn(isActiveRoute(ROUTES.productsCrud))}
                      >
                        <span className="shrink-0">
                          <Package className="h-5 w-5" />
                        </span>
                        <span className="text-[20px] font-extrabold line-clamp-1">Produtos</span>
                      </button>
                    </div>
                  </>
                )}

                <div className="h-px bg-gray-100 my-1" />
              </div>

              {/* categorias (desktop) */}
              <div className="flex-1 px-4 pb-4 overflow-auto">
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setSelectedCategory("all");
                  }}
                  type="button"
                  className={categoryBtnClass(selectedCategory === "all")}
                >
                  <span className="text-[20px] font-extrabold">Todos</span>
                </button>

                <div className="mt-3 flex flex-col gap-3">
                  {categories.map((c) => (
                    <button
                      key={c}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setSelectedCategory(c);
                      }}
                      type="button"
                      className={categoryBtnClass(selectedCategory === c)}
                      title={c}
                    >
                      <span className="line-clamp-1 text-[20px]">{c}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* sair (desktop) */}
              <div className="p-4 border-t border-gray-100">
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleLogout();
                  }}
                  type="button"
                  className="
                    w-full rounded-2xl px-4 py-[20px] text-left
                    border border-gray-200 bg-white
                    hover:bg-gray-50 transition-all duration-200
                    flex items-center gap-3
                    active:scale-[0.99]
                  "
                  title="Voltar para o início"
                >
                  <LogOut className="h-5 w-5 text-gray-700" />
                  <span className="font-extrabold text-[20px] text-gray-900">Sair</span>
                </button>
              </div>
            </div>
          </aside>

          {/* Produtos */}
          <section className="min-w-0">
            <div className="rounded-[22px] sm:rounded-[28px] border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                <div className="text-[13px] sm:text-[14px] font-extrabold text-gray-900">
                  {selectedCategory === "all" ? "Todos os produtos" : selectedCategory}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    className="h-11 w-11 sm:h-10 sm:w-10 rounded-2xl border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50 active:scale-[0.99]"
                    disabled={currentPage <= 1}
                    onClick={() => changePage(currentPage - 1)}
                    aria-label="Página anterior"
                    type="button"
                  >
                    <ChevronLeft className="h-5 w-5 mx-auto text-gray-800" />
                  </button>

                  <div className="text-[12px] text-gray-500 font-semibold min-w-[64px] text-center">
                    <span className="text-gray-900">{currentPage}</span> de{" "}
                    <span className="text-gray-900">{totalPages}</span>
                  </div>

                  <button
                    className="h-11 w-11 sm:h-10 sm:w-10 rounded-2xl border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50 active:scale-[0.99]"
                    disabled={currentPage >= totalPages}
                    onClick={() => changePage(currentPage + 1)}
                    aria-label="Próxima página"
                    type="button"
                  >
                    <ChevronRight className="h-5 w-5 mx-auto text-gray-800" />
                  </button>
                </div>
              </div>

              <div className="p-3 sm:p-4 pb-24 sm:pb-28">
                {loading && !products.length ? (
                  <div className="text-gray-500">Carregando...</div>
                ) : filtered.length === 0 ? (
                  <div className="text-gray-500">Nenhum produto encontrado.</div>
                ) : (
                  <>
                    {/* ✅ IMPORTANTÍSSIMO: mantém 2 colunas SEMPRE (Totem + Mobile) */}
                    <div className="grid grid-cols-2 gap-3 sm:gap-6">
                      {paginated.map((p) => (
                        <ProductCard key={String(p.id)} product={p} />
                      ))}
                    </div>

                    <div className="mt-6 grid grid-cols-3 items-center gap-3">
                      <button
                        className="h-11 w-11 sm:h-10 sm:w-10 rounded-2xl border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50 active:scale-[0.99] justify-self-start"
                        disabled={currentPage <= 1}
                        onClick={() => changePage(currentPage - 1)}
                        aria-label="Página anterior"
                        type="button"
                      >
                        <ChevronLeft className="h-5 w-5 mx-auto text-gray-800" />
                      </button>

                      <button
                        className="h-11 sm:h-10 px-4 rounded-2xl border border-gray-200 bg-gray-100 hover:bg-gray-200 font-extrabold justify-self-center active:scale-[0.99] inline-flex items-center gap-2"
                        onClick={scrollCatalogToTop}
                        type="button"
                        aria-label="Voltar ao topo do catálogo"
                      >
                        <ChevronUp className="h-4 w-4" />
                        {showScrollTopHint ? "Subir no catálogo" : "Ir para o topo"}
                      </button>

                      <button
                        className="h-11 w-11 sm:h-10 sm:w-10 rounded-2xl border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50 active:scale-[0.99] justify-self-end"
                        disabled={currentPage >= totalPages}
                        onClick={() => changePage(currentPage + 1)}
                        aria-label="Próxima página"
                        type="button"
                      >
                        <ChevronRight className="h-5 w-5 mx-auto text-gray-800" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* ✅ Bottom-sheet mobile (Categorias / Menu) — alinhado e sem “coisas fora do lugar” */}
      <div className={["lg:hidden", sheetOpen ? "pointer-events-auto" : "pointer-events-none"].join(" ")}>
        {/* overlay */}
        <button
          type="button"
          onClick={() => setSheetOpen(false)}
          className={[
            "fixed inset-0 z-[9997] transition-opacity duration-200",
            sheetOpen ? "opacity-100 bg-black/60" : "opacity-0 bg-black/0",
          ].join(" ")}
          aria-label="Fechar painel"
        />

        {/* sheet */}
        <div
          className={[
            "fixed left-0 right-0 bottom-0 z-[9998]",
            "transition-transform duration-300",
            sheetOpen ? "translate-y-0" : "translate-y-[105%]",
          ].join(" ")}
          role="dialog"
          aria-modal="true"
        >
          <div className="mx-auto w-full max-w-[720px]">
            <div className="rounded-t-[28px] border border-gray-200 bg-white shadow-2xl overflow-hidden">
              {/* handle */}
              <div className="pt-3 pb-2 flex items-center justify-center">
                <div className="h-1.5 w-14 rounded-full bg-gray-200" />
              </div>

              {/* header */}
              <div className="px-4 pb-3 border-b border-gray-100 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSheetTab("categorias")}
                    className={[
                      "h-10 px-4 rounded-full border font-extrabold text-[13px] active:scale-[0.98]",
                      sheetTab === "categorias"
                        ? "bg-gray-900 text-white border-gray-900"
                        : "bg-white text-gray-800 border-gray-200 hover:bg-gray-50",
                    ].join(" ")}
                  >
                    Categorias
                  </button>
                  <button
                    type="button"
                    onClick={() => setSheetTab("menu")}
                    className={[
                      "h-10 px-4 rounded-full border font-extrabold text-[13px] active:scale-[0.98]",
                      sheetTab === "menu"
                        ? "bg-gray-900 text-white border-gray-900"
                        : "bg-white text-gray-800 border-gray-200 hover:bg-gray-50",
                    ].join(" ")}
                  >
                    Menu
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setSheetOpen(false)}
                  className="h-10 w-10 rounded-2xl border border-gray-200 bg-white hover:bg-gray-50 active:scale-[0.98]"
                  aria-label="Fechar"
                >
                  <X className="h-5 w-5 mx-auto" />
                </button>
              </div>

              {/* body */}
              <div className="p-4 max-h-[70dvh] overflow-auto">
                {sheetTab === "categorias" ? (
                  <div className="flex flex-col gap-3">
                    <button
                      type="button"
                      className={categoryBtnClass(selectedCategory === "all")}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setSelectedCategory("all");
                        setSheetOpen(false);
                      }}
                    >
                      <span className="text-[18px] font-extrabold">Todos</span>
                    </button>

                    <div className="grid grid-cols-1 gap-3">
                      {categories.map((c) => (
                        <button
                          key={c}
                          type="button"
                          className={categoryBtnClass(selectedCategory === c)}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setSelectedCategory(c);
                            setSheetOpen(false);
                          }}
                          title={c}
                        >
                          <span className="line-clamp-1 text-[18px]">{c}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <SwitchPricing compact />

                    {isAdmin && (
                      <>
                        <button
                          type="button"
                          className={selectableBtn(isActiveRoute(ROUTES.notices))}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setSheetOpen(false);
                            safeNavigate(ROUTES.notices);
                          }}
                        >
                          <span className="shrink-0">
                            <Bell className="h-5 w-5" />
                          </span>
                          <span className="text-[18px] font-extrabold line-clamp-1">Avisos</span>
                        </button>

                        <button
                          type="button"
                          className={selectableBtn(isActiveRoute(ROUTES.productsCrud))}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setSheetOpen(false);
                            safeNavigate(ROUTES.productsCrud);
                          }}
                        >
                          <span className="shrink-0">
                            <Package className="h-5 w-5" />
                          </span>
                          <span className="text-[18px] font-extrabold line-clamp-1">Produtos</span>
                        </button>
                      </>
                    )}

                    <div className="h-px bg-gray-100" />

                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setSheetOpen(false);
                        handleLogout();
                      }}
                      type="button"
                      className="
                        w-full rounded-2xl px-4 py-[18px] text-left
                        border border-gray-200 bg-white
                        hover:bg-gray-50 transition-all duration-200
                        flex items-center gap-3
                        active:scale-[0.99]
                      "
                      title="Voltar para o início"
                    >
                      <LogOut className="h-5 w-5 text-gray-700" />
                      <span className="font-extrabold text-[18px] text-gray-900">Sair</span>
                    </button>
                  </div>
                )}
              </div>

              {/* safe area spacer */}
              <div className="h-[max(12px,env(safe-area-inset-bottom))]" />
            </div>
          </div>
        </div>
      </div>

      <div
        data-search-keyboard="1"
        data-testid="catalog-search-keyboard"
        className={[
          "fixed inset-x-0 bottom-0 z-[85] transition-all duration-200",
          searchKeyboardOpen ? "translate-y-0 opacity-100" : "translate-y-[110%] opacity-0 pointer-events-none",
        ].join(" ")}
      >
        <div className="border-t border-black/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(255,255,255,0.995))] px-3 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 shadow-[0_-24px_64px_rgba(0,0,0,0.18)] backdrop-blur-xl sm:px-4 sm:pt-4">
          <div className="mx-auto w-full max-w-[1280px]">
            <div className="mb-3 flex items-center justify-between gap-3 sm:mb-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#7d1717]/12 bg-[#7d1717]/5 px-4 py-2 text-[14px] font-black text-[#6a1f1f] sm:text-[16px]">
                <Keyboard className="h-4 w-4 sm:h-5 sm:w-5" />
                Buscar produto
              </div>
              <button
                type="button"
                data-testid="catalog-search-close"
                onClick={() => setSearchKeyboardOpen(false)}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-black/10 bg-white px-4 text-[14px] font-black text-gray-800 shadow-[0_10px_24px_rgba(0,0,0,0.08)] active:scale-[0.98]"
              >
                <X className="h-4 w-4" />
                Fechar
              </button>
            </div>

            <div className="space-y-2 sm:space-y-3">
              {SEARCH_KEYBOARD_ROWS.map((row, rowIndex) => (
                <div
                  key={rowIndex}
                  className={`grid gap-2 sm:gap-3 ${
                    rowIndex === 2
                      ? "grid-cols-9 px-1 sm:px-6"
                      : rowIndex === 3
                      ? "grid-cols-7 px-6 sm:px-16"
                      : "grid-cols-10"
                  }`}
                >
                  {row.map((key) => (
                    <button
                      key={key}
                      type="button"
                      data-testid={`catalog-search-key-${key}`}
                      onClick={() => handleSearchKeyPress(key)}
                      className="h-[58px] rounded-[18px] border border-white/50 bg-white text-[22px] font-black text-[#6a1f1f] shadow-[0_10px_20px_rgba(0,0,0,0.08)] active:scale-[0.97] sm:h-[84px] sm:rounded-[22px] sm:text-[34px]"
                    >
                      {key}
                    </button>
                  ))}
                </div>
              ))}

              <div className="grid grid-cols-[1.4fr_2.8fr_1.4fr] gap-2 sm:gap-3">
                <button
                  type="button"
                  data-testid="catalog-search-backspace"
                  onClick={handleSearchBackspace}
                  className="h-[58px] rounded-[18px] border border-white/50 bg-white px-3 text-[18px] font-extrabold text-[#6a1f1f] shadow-[0_10px_20px_rgba(0,0,0,0.08)] active:scale-[0.97] sm:h-[84px] sm:rounded-[22px] sm:text-[26px]"
                >
                  <span className="inline-flex items-center gap-2">
                    <Delete className="h-5 w-5 sm:h-6 sm:w-6" />
                    Apagar
                  </span>
                </button>
                <button
                  type="button"
                  data-testid="catalog-search-space"
                  onClick={() => handleSearchKeyPress("SPACE")}
                  className="h-[58px] rounded-[18px] border border-white/50 bg-white text-[18px] font-extrabold text-[#6a1f1f] shadow-[0_10px_20px_rgba(0,0,0,0.08)] active:scale-[0.97] sm:h-[84px] sm:rounded-[22px] sm:text-[26px]"
                >
                  <span className="inline-flex items-center gap-2">
                    <SpaceIcon className="h-5 w-5 sm:h-6 sm:w-6" />
                    Espaço
                  </span>
                </button>
                <button
                  type="button"
                  data-testid="catalog-search-clear-keyboard"
                  onClick={() => setSearchTerm("")}
                  className="h-[58px] rounded-[18px] bg-[linear-gradient(180deg,#c22b2b_0%,#7f0b0f_100%)] text-[18px] font-extrabold text-white shadow-[0_18px_32px_rgba(126,11,15,0.28)] active:scale-[0.97] sm:h-[84px] sm:rounded-[22px] sm:text-[24px]"
                >
                  Limpar
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <CartToggle />
      <Cart />
    </div>
  );
};

export default Index;
