// src/pages/MyOrdersPage.tsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useCart } from "@/contexts/CartContext";
import type { Product } from "@/types/products";

import logoGostinho from "@/images/logoc.png";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

import CartToggle from "@/components/CartToggle";
import Cart from "@/components/Cart";
import { getChannelBasePrice, resolveProductPrice } from "@/utils/productPricing";
import { getCustomerSessionSnapshot } from "@/utils/customerSession";

import {
  Search,
  ChevronLeft,
  History,
  Bell,
  LogOut,
  Loader2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
} from "lucide-react";

/* --------------------------------------------------------
   ROUTES
   ✅ manter só: Avisos e Últimos pedidos
   (Catálogo e Sair também ficam)
-------------------------------------------------------- */
const ROUTES = {
  catalog: "/catalogo",
  lastOrders: "/meus-pedidos",
  notices: "/avisos",
  login: "/login",
  checkout: "/checkout",
};

/* --------------------------------------------------------
   HELPER: SESSION (CLIENTE)
-------------------------------------------------------- */
/* --------------------------------------------------------
   HELPERS
-------------------------------------------------------- */
function onlyDigits(v: any) {
  return (v ?? "").toString().replace(/\D/g, "").trim();
}

function padDoc(docDigits: string) {
  const d = onlyDigits(docDigits);
  if (d.length === 10) return d.padStart(11, "0");
  if (d.length === 13) return d.padStart(14, "0");
  return d;
}

function normalizeForSearch(text: string) {
  return (text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "");
}

const formatCurrency = (value: number) =>
  (value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function formatDateTimeBR(dateIso: string) {
  try {
    return new Date(dateIso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
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

/* --------------------------------------------------------
   PRICING CONTEXT (tabela escolhida no questionário)
-------------------------------------------------------- */
type PricingCustomerType = "cpf" | "cnpj";
type PricingChannelType = "varejo" | "atacado";

type PricingContext = {
  customer_type: PricingCustomerType | null;
  channel: PricingChannelType | null;
  price_table: string | null;
};

function safeGetPricingContextNow(): PricingContext {
  try {
    const raw = localStorage.getItem("pricing_context");
    if (!raw) return { customer_type: null, channel: null, price_table: null };
    const p = JSON.parse(raw);

    const ct = p?.customer_type;
    const ch = p?.channel;

    const okCt = ct === "cpf" || ct === "cnpj";
    const okCh = ch === "varejo" || ch === "atacado";

    const pt = typeof p?.price_table === "string" ? String(p.price_table).trim() : null;

    return {
      customer_type: okCt ? ct : null,
      channel: okCh ? ch : null,
      price_table: pt && pt.length ? pt : null,
    };
  } catch {
    return { customer_type: null, channel: null, price_table: null };
  }
}

function pickPriceByContext(product: Product, ctx: PricingContext): number {
  return resolveProductPrice(product, ctx);
}

/* --------------------------------------------------------
   TYPES
-------------------------------------------------------- */
type OrderItem = {
  id: string;
  product_id?: string | null;
  product_name: string;
  quantity: number;
  unit_price_cents?: number | null;
};

type Order = {
  id: string;
  order_number: string | null;
  total_items: number | null;
  total_value: number | null;
  status: string | null;
  created_at: string;
  order_items?: OrderItem[];
};

/* --------------------------------------------------------
   MAPEAR PRODUTO DO SUPABASE -> Product
-------------------------------------------------------- */
function mapSupabaseProduct(row: any): Product {
  const varejoBasePrice = getChannelBasePrice(row, "varejo");
  const atacadoBasePrice = getChannelBasePrice(row, "atacado");

  const imagesFromRow = Array.isArray(row.images) ? row.images.filter(Boolean) : [];
  const imagePath = row.image_path ?? row.imagePath ?? null;
  const singleImage = row.image ?? row.image_url ?? row.photo ?? null;

  const images =
    imagesFromRow.length > 0 ? imagesFromRow : imagePath ? [imagePath] : singleImage ? [singleImage] : [];

  const p: any = {
    id: String(row.id),
    old_id: row.old_id ?? null,
    name: row.name ?? "",
    price: varejoBasePrice,
    employee_price: atacadoBasePrice,
    images,
    image_path: imagePath,
    category: row.category ?? row.category_name ?? "Outros",
    description: row.description ?? "",
    packageInfo: row.packageInfo ?? row.package_info ?? "",
    weight: toNumber(row.weight ?? row.weight_kg ?? 0, 0),
    isPackage: !!(row.isPackage ?? row.is_package ?? false),
    featured: !!(row.featured ?? row.isFeatured ?? false),
    inStock: row.inStock ?? row.in_stock ?? true,
    isLaunch: !!(row.isLaunch ?? row.is_launch ?? false),
    extraInfo: row.extraInfo ?? undefined,

    price_cpf_atacado: row.price_cpf_atacado,
    price_cpf_varejo: row.price_cpf_varejo,
    price_cnpj_atacado: row.price_cnpj_atacado,
    price_cnpj_varejo: row.price_cnpj_varejo,
  };

  return p as Product;
}

/* --------------------------------------------------------
   CALC HELPERS
-------------------------------------------------------- */
function calcTotalItemsFromItems(items: OrderItem[] | undefined) {
  return (items ?? []).reduce((acc, it) => acc + Number(it.quantity ?? 0), 0);
}

function calcTotalValueFromItemsBRL(items: OrderItem[] | undefined) {
  const cents = (items ?? []).reduce((acc, it) => {
    const qty = Number(it.quantity ?? 0);
    const unit = Number(it.unit_price_cents ?? 0);
    if (!Number.isFinite(qty) || !Number.isFinite(unit)) return acc;
    return acc + unit * qty;
  }, 0);
  return cents / 100;
}

/* --------------------------------------------------------
   HELPERS: IDs
-------------------------------------------------------- */
function isUuidLike(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

/* --------------------------------------------------------
   PAGE
-------------------------------------------------------- */
const MyOrdersPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const { clearCart, addMultipleToCart } = useCart();

  const customer: any = getCustomerSessionSnapshot();
  const displayName = customer?.name ?? customer?.full_name ?? "Cliente";

  const sessionDocRaw = useMemo(
    () => customer?.document ?? customer?.cpf ?? customer?.cpf_cnpj ?? "",
    [customer?.document, customer?.cpf, customer?.cpf_cnpj]
  );

  const docDigits = useMemo(() => onlyDigits(sessionDocRaw), [sessionDocRaw]);
  const docPadded = useMemo(() => padDoc(docDigits), [docDigits]);

  const isLogged = !!docDigits || !!docPadded;

  useEffect(() => {
    if (!isLogged) navigate(ROUTES.login, { replace: true });
  }, [isLogged, navigate]);

  /* ✅ “full-bleed” (remove moldura Vite/#root) + mantém scroll */
  useEffect(() => {
    const root = document.getElementById("root");

    const prev = {
      htmlOverflow: document.documentElement.style.overflow,
      htmlHeight: document.documentElement.style.height,
      htmlBackground: document.documentElement.style.background,

      bodyOverflow: document.body.style.overflow,
      bodyHeight: document.body.style.height,
      bodyMargin: document.body.style.margin,
      bodyBackground: document.body.style.background,
      bodyDisplay: document.body.style.display,

      rootMaxWidth: root?.style.maxWidth ?? "",
      rootPadding: root?.style.padding ?? "",
      rootMargin: root?.style.margin ?? "",
      rootWidth: root?.style.width ?? "",
      rootMinHeight: root?.style.minHeight ?? "",
      rootDisplay: root?.style.display ?? "",
    };

    document.documentElement.style.height = "100%";
    document.body.style.height = "100%";
    document.body.style.margin = "0";
    document.body.style.display = "block";
    document.documentElement.style.background = "#f6f7f9";
    document.body.style.background = "#f6f7f9";

    if (root) {
      root.style.maxWidth = "none";
      root.style.padding = "0";
      root.style.margin = "0";
      root.style.width = "100%";
      root.style.minHeight = "100dvh";
      root.style.display = "block";
    }

    return () => {
      document.documentElement.style.overflow = prev.htmlOverflow;
      document.documentElement.style.height = prev.htmlHeight;
      document.documentElement.style.background = prev.htmlBackground;

      document.body.style.overflow = prev.bodyOverflow;
      document.body.style.height = prev.bodyHeight;
      document.body.style.margin = prev.bodyMargin;
      document.body.style.background = prev.bodyBackground;
      document.body.style.display = prev.bodyDisplay;

      if (root) {
        root.style.maxWidth = prev.rootMaxWidth;
        root.style.padding = prev.rootPadding;
        root.style.margin = prev.rootMargin;
        root.style.width = prev.rootWidth;
        root.style.minHeight = prev.rootMinHeight;
        root.style.display = prev.rootDisplay;
      }
    };
  }, []);

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [refazendoId, setRefazendoId] = useState<string | null>(null);
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "done" | "canceled">("all");

  const isActiveRoute = (path: string) => {
    const cur = location?.pathname ?? "";
    if (!path) return false;
    return cur === path || cur.startsWith(path + "/");
  };

  const handleLogout = () => {
    try {
      localStorage.removeItem("customer_session");
    } catch {}
    navigate(ROUTES.login);
  };

  const fetchOrdersFallback = useCallback(async (docParam: string) => {
    const { data: ordersRows, error: oErr } = await supabase
      .from("orders")
      .select("id, order_number, status, created_at, total_items, total_value")
      .eq("customer_document", docParam)
      .order("created_at", { ascending: false })
      .limit(50);

    if (oErr) throw oErr;

    const oList = (ordersRows ?? []) as any[];
    if (oList.length === 0) return [] as Order[];

    const orderIds = oList.map((o) => o.id).filter(Boolean);

    const { data: itemsRows, error: iErr } = await supabase
      .from("order_items")
      .select("id, order_id, product_id, product_name, quantity, unit_price_cents")
      .in("order_id", orderIds);

    if (iErr) throw iErr;

    const items = (itemsRows ?? []) as any[];

    const itemsByOrder = new Map<string, OrderItem[]>();
    for (const it of items) {
      const oid = String(it.order_id ?? "");
      if (!oid) continue;
      const arr = itemsByOrder.get(oid) ?? [];
      arr.push({
        id: String(it.id),
        product_id: it.product_id ? String(it.product_id) : null,
        product_name: it.product_name ?? "",
        quantity: Number(it.quantity ?? 0),
        unit_price_cents: it.unit_price_cents == null ? null : Number(it.unit_price_cents),
      });
      itemsByOrder.set(oid, arr);
    }

    return oList.map((r: any) => ({
      id: String(r.id),
      order_number: r.order_number ?? null,
      total_items: r.total_items ?? null,
      total_value: r.total_value ?? null,
      status: r.status ?? null,
      created_at: r.created_at,
      order_items: itemsByOrder.get(String(r.id)) ?? [],
    })) as Order[];
  }, []);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    try {
      const docParam = docDigits || docPadded;
      if (!docParam) {
        setOrders([]);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.rpc("customer_orders_with_items", {
        p_customer_document: docParam,
      });

      if (!error) {
        const rows = (data ?? []) as any[];
        const mapped: Order[] = rows.map((r: any) => ({
          id: String(r.id),
          order_number: r.order_number ?? null,
          total_items: r.total_items ?? null,
          total_value: r.total_value ?? null,
          status: r.status ?? null,
          created_at: r.created_at,
          order_items: Array.isArray(r.order_items) ? r.order_items : [],
        }));
        setOrders(mapped);
        return;
      }

      const fallback = await fetchOrdersFallback(docParam);
      setOrders(fallback);

      if (fallback.length === 0) {
        setLoadError(
          `Não encontrei pedidos para este documento. (RPC falhou e fallback não retornou.) Erro RPC: ${error.message}`
        );
      }
    } catch (e: any) {
      setOrders([]);
      setLoadError(e?.message ? `Erro ao carregar pedidos: ${e.message}` : "Erro ao carregar pedidos.");
    } finally {
      setLoading(false);
    }
  }, [docDigits, docPadded, fetchOrdersFallback]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    const onFocus = () => fetchOrders();
    const onVisibility = () => {
      if (document.visibilityState === "visible") fetchOrders();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchOrders]);

  async function handleRefazerPedido(order: Order) {
    try {
      setRefazendoId(order.id);

      const pricingCtx = safeGetPricingContextNow();

      const rows = (order.order_items ?? []) as any[];
      if (!rows.length) {
        alert("Esse pedido não tem itens para refazer.");
        return;
      }

      const rawIds = Array.from(
        new Set(
          rows
            .map((r) => (r?.product_id == null ? "" : String(r.product_id)))
            .map((v) => v.trim())
            .filter(Boolean)
        )
      );

      const uuidIds = rawIds.filter((id) => isUuidLike(id));
      const oldIds = rawIds
        .filter((id) => !isUuidLike(id) && /^\d+$/.test(id))
        .map((id) => Number(id))
        .filter((n) => Number.isFinite(n));

      let prodRows: any[] = [];

      if (uuidIds.length > 0) {
        const { data, error } = await supabase.from("products").select("*").in("id", uuidIds);
        if (error) throw error;
        prodRows = prodRows.concat(data ?? []);
      }

      if (oldIds.length > 0) {
        const { data, error } = await supabase.from("products").select("*").in("old_id", oldIds);
        if (error) throw error;
        prodRows = prodRows.concat(data ?? []);
      }

      if (prodRows.length === 0) {
        alert("Não consegui localizar os produtos desse pedido no catálogo (IDs não batem).");
        return;
      }

      const prodById = new Map<string, Product>();
      const prodByOldId = new Map<string, Product>();
      const prodByName = new Map<string, Product>();

      for (const p of prodRows) {
        const mapped = mapSupabaseProduct(p);
        prodById.set(String(mapped.id), mapped);
        if ((mapped as any).old_id != null) prodByOldId.set(String((mapped as any).old_id), mapped);
        if (mapped.name) prodByName.set(normalizeForSearch(mapped.name), mapped);
      }

      const toAdd: { product: Product; quantity: number }[] = [];
      let missing = 0;

      for (const it of rows) {
        const qty = Number(it.quantity ?? 0);
        if (!Number.isFinite(qty) || qty <= 0) continue;

        const pidRaw = it.product_id == null ? "" : String(it.product_id).trim();
        const nameKey = normalizeForSearch(it.product_name ?? "");

        const product: Product | undefined =
          (pidRaw ? prodById.get(pidRaw) ?? prodByOldId.get(pidRaw) : undefined) ??
          (nameKey ? prodByName.get(nameKey) : undefined);

        if (!product) {
          missing++;
          continue;
        }

        const chosenPrice = pickPriceByContext(product, pricingCtx);

        const pricedProduct: Product = {
          ...(product as any),
          price: chosenPrice,
          employee_price: chosenPrice,
        } as Product;

        toAdd.push({ product: pricedProduct, quantity: qty });
      }

      if (toAdd.length === 0) {
        alert("Nenhum item do pedido pôde ser adicionado ao carrinho (produtos indisponíveis).");
        return;
      }

      clearCart();
      addMultipleToCart(toAdd);

      if (missing > 0) alert("Alguns itens não estão mais disponíveis e não foram adicionados ao carrinho.");
      else alert("Pedido recarregado no carrinho. Confira e finalize.");

      navigate(ROUTES.checkout);
    } catch (e: any) {
      alert(e?.message ? `Erro ao refazer pedido: ${e.message}` : "Erro inesperado ao refazer o pedido.");
    } finally {
      setRefazendoId(null);
    }
  }

  const chipClass = (active: boolean) =>
    `
      h-11 px-5 rounded-2xl border font-extrabold text-[13px]
      transition-all duration-200
      ${active ? "bg-black text-white border-black" : "bg-white border-gray-200 text-gray-900 hover:bg-gray-50"}
      active:scale-[0.99]
    `;

  const filteredOrders = useMemo(() => {
    const q = normalizeForSearch(searchTerm).trim();

    const statusOk = (status: string | null) => {
      const s = (status ?? "").toLowerCase();
      if (statusFilter === "all") return true;
      if (statusFilter === "pending") return s.includes("pend") || s.includes("aguard");
      if (statusFilter === "done") return s.includes("final") || s.includes("concl") || s.includes("pronto");
      if (statusFilter === "canceled") return s.includes("cancel");
      return true;
    };

    return (orders ?? []).filter((o) => {
      if (!statusOk(o.status)) return false;
      if (!q) return true;

      const itemsText = (o.order_items ?? []).map((i) => `${i.product_name} ${i.quantity}`).join(" ");

      const hay = normalizeForSearch(
        [o.status ?? "", o.created_at ?? "", String(o.total_items ?? ""), String(o.total_value ?? ""), itemsText].join(" ")
      );

      return hay.includes(q);
    });
  }, [orders, searchTerm, statusFilter]);

  const totalCountText = useMemo(() => (loading ? "…" : `${orders.length} pedidos`), [loading, orders.length]);

  return (
    <div className="min-h-[100dvh] w-full bg-[#f6f7f9]">
      {/* HERO (mobile-friendly) */}
      <section className="px-4 sm:px-5 pt-4 sm:pt-5">
        <div className="relative overflow-hidden rounded-[26px] sm:rounded-[28px] bg-white border border-gray-200 shadow-sm">
          <div className="h-[140px] sm:h-[160px] w-full bg-gray-100 overflow-hidden">
            <div className="h-full w-full grid place-items-center">
              <img src={logoGostinho} alt="GM" className="h-14 sm:h-16 opacity-80" />
            </div>
          </div>

          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />

          <div className="absolute left-4 right-4 sm:left-5 sm:right-5 bottom-4 text-white">
            <div className="text-[10px] sm:text-[11px] font-extrabold tracking-[0.2em] opacity-90 uppercase">
              Histórico
            </div>
            <div className="mt-1 text-[20px] sm:text-[22px] font-extrabold leading-tight line-clamp-1">
              Meus pedidos
            </div>

            <div className="mt-1 text-[12px] sm:text-[13px] opacity-90 line-clamp-1">{displayName}</div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <button
                onClick={() => navigate(ROUTES.catalog)}
                className="h-11 sm:h-12 px-5 sm:px-6 rounded-2xl bg-white text-black font-extrabold hover:bg-gray-100 active:scale-[0.99]"
              >
                Voltar ao catálogo
              </button>

              <div className="inline-flex items-center gap-2 rounded-2xl bg-white/20 backdrop-blur border border-white/25 px-4 sm:px-5 h-11 sm:h-12">
                <History className="h-5 w-5" />
                <span className="text-[12px] sm:text-[13px] font-extrabold">{totalCountText}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* BUSCA + FILTROS (mobile first) */}
      <div className="sticky top-0 z-40 bg-[#f6f7f9]/95 backdrop-blur px-4 sm:px-5 pt-4 sm:pt-5 pb-4 sm:pb-5">
        <div className="relative">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-6 w-6 text-gray-400" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar pedidos (item, data...)"
            className="
              h-14 sm:h-16 pl-14 pr-5
              rounded-[22px] sm:rounded-[24px]
              bg-white border border-gray-200
              shadow-[0_10px_24px_rgba(0,0,0,0.06)]
              text-[16px] sm:text-[17px] font-semibold
              placeholder:text-gray-400
              focus-visible:ring-2 focus-visible:ring-black/10
            "
            inputMode="search"
          />
        </div>

        {/* ✅ mobile: 2x2; desktop: 4 col */}
        <div className="mt-3 sm:mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <button type="button" className={chipClass(statusFilter === "all")} onClick={() => setStatusFilter("all")}>
            Todos
          </button>
          <button
            type="button"
            className={chipClass(statusFilter === "pending")}
            onClick={() => setStatusFilter("pending")}
          >
            Pendentes
          </button>
          <button type="button" className={chipClass(statusFilter === "done")} onClick={() => setStatusFilter("done")}>
            Finalizados
          </button>
          <button
            type="button"
            className={chipClass(statusFilter === "canceled")}
            onClick={() => setStatusFilter("canceled")}
          >
            Cancelados
          </button>
        </div>

        {/* ✅ MOBILE QUICK NAV (substitui sidebar) */}
        <div className="mt-3 sm:hidden grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => navigate(ROUTES.lastOrders)}
            className={`
              h-12 rounded-2xl border font-extrabold text-[13px]
              flex items-center justify-center gap-2
              ${
                isActiveRoute(ROUTES.lastOrders)
                  ? "bg-black text-white border-black"
                  : "bg-white text-gray-900 border-gray-200 hover:bg-gray-50"
              }
              active:scale-[0.99]
            `}
          >
            <History className="h-4 w-4" />
            Últimos pedidos
          </button>

          <button
            type="button"
            onClick={() => navigate(ROUTES.notices)}
            className={`
              h-12 rounded-2xl border font-extrabold text-[13px]
              flex items-center justify-center gap-2
              ${
                isActiveRoute(ROUTES.notices)
                  ? "bg-black text-white border-black"
                  : "bg-white text-gray-900 border-gray-200 hover:bg-gray-50"
              }
              active:scale-[0.99]
            `}
          >
            <Bell className="h-4 w-4" />
            Avisos
          </button>
        </div>
      </div>

      <main className="px-4 sm:px-5 pb-28 sm:pb-28">
        {loadError && (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700 font-semibold">
            Erro: {loadError}
          </div>
        )}

        {/* ✅ MOBILE: 1 coluna; DESKTOP: sidebar + conteúdo */}
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6 items-start">
          {/* SIDEBAR (só desktop) */}
          <aside className="hidden lg:block self-start sticky top-[112px] h-[calc(100dvh-128px)]">
            <div className="h-full rounded-[26px] border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col">
              <div className="p-4 flex flex-col gap-3">
                <button
                  onClick={() => navigate(ROUTES.lastOrders)}
                  type="button"
                  className={`
                    w-full rounded-2xl px-4 py-[20px] text-left border transition-all duration-200
                    flex items-center gap-3 active:scale-[0.99]
                    ${
                      isActiveRoute(ROUTES.lastOrders)
                        ? "bg-gradient-to-br from-gray-950 via-gray-900 to-gray-800 text-white border-black/30 ring-2 ring-black/10 scale-[1.01]"
                        : "bg-white border-gray-200 text-gray-900 hover:bg-gray-50"
                    }
                  `}
                >
                  <History className="h-5 w-5" />
                  <span className="text-[20px] font-extrabold line-clamp-1">Últimos pedidos</span>
                </button>

                <button
                  onClick={() => navigate(ROUTES.notices)}
                  type="button"
                  className={`
                    w-full rounded-2xl px-4 py-[20px] text-left border transition-all duration-200
                    flex items-center gap-3 active:scale-[0.99]
                    ${
                      isActiveRoute(ROUTES.notices)
                        ? "bg-gradient-to-br from-gray-950 via-gray-900 to-gray-800 text-white border-black/30 ring-2 ring-black/10 scale-[1.01]"
                        : "bg-white border-gray-200 text-gray-900 hover:bg-gray-50"
                    }
                  `}
                >
                  <Bell className="h-5 w-5" />
                  <span className="text-[20px] font-extrabold line-clamp-1">Avisos</span>
                </button>

                <div className="h-px bg-gray-100 my-1" />

                <button
                  onClick={() => navigate(ROUTES.catalog)}
                  type="button"
                  className="
                    w-full rounded-2xl px-4 py-[20px] text-left
                    border border-gray-200 bg-white
                    hover:bg-gray-50 transition-all duration-200
                    flex items-center gap-3
                    active:scale-[0.99]
                  "
                  title="Voltar ao catálogo"
                >
                  <ChevronLeft className="h-5 w-5 text-gray-700" />
                  <span className="font-extrabold text-[20px] text-gray-900">Catálogo</span>
                </button>
              </div>

              <div className="mt-auto p-4 border-t border-gray-100">
                <button
                  onClick={handleLogout}
                  type="button"
                  className="
                    w-full rounded-2xl px-4 py-[20px] text-left
                    border border-gray-200 bg-white
                    hover:bg-gray-50 transition-all duration-200
                    flex items-center gap-3
                    active:scale-[0.99]
                  "
                  title="Sair"
                >
                  <LogOut className="h-5 w-5 text-gray-700" />
                  <span className="font-extrabold text-[20px] text-gray-900">Sair</span>
                </button>
              </div>
            </div>
          </aside>

          {/* LISTA */}
          <section className="min-w-0">
            <div className="rounded-[26px] sm:rounded-[28px] border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="p-4 border-b border-gray-100 flex items-end justify-between">
                <div>
                  <div className="text-[15px] sm:text-[16px] font-extrabold text-gray-900">Últimos pedidos</div>
                  <div className="text-[12px] text-gray-500 mt-1">Abra um pedido para ver itens e refazer rapidamente</div>
                </div>

                {!loading && (
                  <div className="text-[12px] text-gray-500 font-semibold">{filteredOrders.length} resultado(s)</div>
                )}
              </div>

              <div className="p-4 pb-10">
                {loading ? (
                  <div className="inline-flex items-center gap-2 text-gray-600 font-semibold">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Carregando pedidos...
                  </div>
                ) : orders.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-6 text-center">
                    <div className="mx-auto h-12 w-12 rounded-2xl bg-white border border-gray-200 grid place-items-center">
                      <ClipboardList className="h-6 w-6 text-gray-600" />
                    </div>
                    <div className="mt-3 text-[15px] font-extrabold text-gray-900">Você ainda não fez pedidos</div>
                    <div className="mt-1 text-[13px] text-gray-600">Assim que finalizar um pedido, ele aparece aqui.</div>
                    <button
                      onClick={() => navigate(ROUTES.catalog)}
                      className="mt-4 h-12 px-6 rounded-2xl bg-black text-white font-extrabold hover:bg-black/90 active:scale-[0.99]"
                    >
                      Ver catálogo
                    </button>
                  </div>
                ) : filteredOrders.length === 0 ? (
                  <div className="text-gray-500 font-semibold">Nenhum pedido encontrado com esse filtro/busca.</div>
                ) : (
                  <div className="space-y-4">
                    {filteredOrders.map((order) => {
                      const isOpen = openOrderId === order.id;

                      const itemsTotal = calcTotalItemsFromItems(order.order_items);
                      const valueFromItems = calcTotalValueFromItemsBRL(order.order_items);

                      const totalItems =
                        Number.isFinite(Number(order.total_items)) && Number(order.total_items) > 0
                          ? Number(order.total_items)
                          : itemsTotal;

                      const totalValueBRL =
                        Number.isFinite(Number(order.total_value)) && Number(order.total_value) > 0
                          ? Number(order.total_value)
                          : valueFromItems;

                      const dateTime = formatDateTimeBR(order.created_at);

                      return (
                        <div key={order.id} className="rounded-[24px] sm:rounded-[26px] border border-gray-200 bg-white shadow-sm p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-[15px] sm:text-[16px] font-extrabold text-gray-900 leading-tight">
                                {dateTime}
                              </div>

                              <div className="mt-1 text-[12px] text-gray-600 font-semibold">
                                {totalItems} itens • {formatCurrency(totalValueBRL)}
                              </div>
                            </div>

                            <div className="shrink-0">
                              <div className="text-[12px] font-extrabold text-gray-500 text-right">
                                {order.status ? String(order.status) : "—"}
                              </div>
                              {order.order_number && (
                                <div className="text-[11px] text-gray-500 font-semibold text-right">
                                  #{order.order_number}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* ✅ MOBILE: botões em coluna */}
                          <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                            <Button
                              variant="outline"
                              className="rounded-2xl h-11 w-full sm:w-auto justify-between sm:justify-center"
                              onClick={() => setOpenOrderId((prev) => (prev === order.id ? null : order.id))}
                            >
                              <span className="mr-2 font-extrabold">{isOpen ? "Esconder itens" : "Ver itens"}</span>
                              {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </Button>

                            <Button
                              className="rounded-2xl h-11 w-full sm:w-auto bg-black text-white hover:bg-black/90"
                              onClick={() => handleRefazerPedido(order)}
                              disabled={refazendoId === order.id}
                            >
                              {refazendoId === order.id ? (
                                <>
                                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                  Refazendo...
                                </>
                              ) : (
                                "Refazer pedido"
                              )}
                            </Button>
                          </div>

                          {isOpen && (order.order_items?.length ?? 0) > 0 && (
                            <div className="mt-4 border-t border-gray-100 pt-4">
                              <div className="text-[12px] font-extrabold text-gray-900 mb-2">Itens do pedido</div>

                              <ul className="space-y-2">
                                {(order.order_items ?? []).map((item) => {
                                  const qty = Number(item.quantity ?? 0);
                                  const unitCents = Number(item.unit_price_cents ?? 0);
                                  const subtotal = (unitCents * qty) / 100;

                                  return (
                                    <li
                                      key={item.id}
                                      className="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2"
                                    >
                                      <div className="min-w-0">
                                        <div className="text-[13px] font-extrabold text-gray-900 truncate">
                                          {item.product_name}
                                        </div>
                                        <div className="text-[12px] text-gray-600 font-semibold">
                                          Quantidade: {qty}
                                        </div>
                                      </div>

                                      <div className="text-[13px] font-extrabold text-gray-900">
                                        {formatCurrency(subtotal)}
                                      </div>
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          )}

                          {isOpen && (order.order_items?.length ?? 0) === 0 && (
                            <div className="mt-4 border-t border-gray-100 pt-4 text-[12px] text-gray-600 font-semibold">
                              Nenhum item encontrado neste pedido.
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* ✅ Bottom bar (mobile) com ações essenciais */}
      <div className="lg:hidden fixed left-0 right-0 bottom-0 z-40 bg-white/95 backdrop-blur border-t border-gray-200">
        <div className="px-4 py-3 grid grid-cols-3 gap-3">
          <button
            type="button"
            onClick={() => navigate(ROUTES.catalog)}
            className="h-12 rounded-2xl border border-gray-200 bg-white font-extrabold text-[13px] flex items-center justify-center gap-2 active:scale-[0.99]"
          >
            <ChevronLeft className="h-4 w-4" />
            Catálogo
          </button>

          <button
            type="button"
            onClick={() => navigate(ROUTES.notices)}
            className={`
              h-12 rounded-2xl border font-extrabold text-[13px] flex items-center justify-center gap-2 active:scale-[0.99]
              ${isActiveRoute(ROUTES.notices) ? "bg-black text-white border-black" : "bg-white text-gray-900 border-gray-200"}
            `}
          >
            <Bell className="h-4 w-4" />
            Avisos
          </button>

          <button
            type="button"
            onClick={handleLogout}
            className="h-12 rounded-2xl border border-gray-200 bg-white font-extrabold text-[13px] flex items-center justify-center gap-2 active:scale-[0.99]"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </div>
      </div>

      <CartToggle />
      <Cart />
    </div>
  );
};

export default MyOrdersPage;
