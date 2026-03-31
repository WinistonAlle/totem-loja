// src/pages/FavoritesPage.tsx
import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import type { Product } from "../types/products";

import ProductCard from "../components/ProductCard";
import CartToggle from "../components/CartToggle";
import Cart from "../components/Cart";

import { Input } from "@/components/ui/input";
import logoGostinho from "@/images/logoc.png";
import { resolveProductPrice } from "@/utils/productPricing";
import { getPricingContext } from "@/utils/pricingContext";

import { Search, ChevronLeft, Heart, History, Bell, LogOut } from "lucide-react";

/* --------------------------------------------------------
   ROUTES (cliente)
-------------------------------------------------------- */
const ROUTES = {
  catalog: "/catalogo",
  favorites: "/favoritos",
  lastOrders: "/meus-pedidos",
  notices: "/avisos",
  login: "/login",
};

/* --------------------------------------------------------
   SESSION HELPERS (somente customer)
-------------------------------------------------------- */
function safeGetCustomer() {
  try {
    const raw = localStorage.getItem("customer_session");
    if (!raw) return {};
    if (raw.trim().startsWith("{") || raw.trim().startsWith("[")) return JSON.parse(raw);
    return {};
  } catch {
    return {};
  }
}

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

/* --------------------------------------------------------
   PRICING CONTEXT (CPF/CNPJ + ATACADO/VAREJO)
-------------------------------------------------------- */
function resolvePriceFromCtx(row: any, ctx: ReturnType<typeof getPricingContext>): number {
  return resolveProductPrice(row, ctx);
}

function stampFinalPrice(product: any, finalPrice: number) {
  const p = { ...(product ?? {}) };
  p.price = finalPrice;
  p.employee_price = finalPrice;

  p.customer_price = finalPrice;
  p.retail_price = finalPrice;
  p.wholesale_price = finalPrice;
  p.atacado_price = finalPrice;
  p.varejo_price = finalPrice;

  return p;
}

/* --------------------------------------------------------
   MAPEAR PRODUTO
-------------------------------------------------------- */
function mapSupabaseProduct(row: any, ctx: ReturnType<typeof getPricingContext>): Product {
  const finalPrice = resolvePriceFromCtx(row, ctx);

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

  const base: any = {
    id: row.id ?? row.old_id ?? String(row.old_id ?? ""),
    old_id: row.old_id ?? null,
    name: row.name ?? "",
    images,
    image_path: imagePath,
    category: row.category ?? row.category_name ?? "Outros",
    description: row.description ?? "",
    packageInfo: row.packageInfo ?? row.package_info ?? "",
    weight: toNumber(row.weight ?? row.weight_kg ?? 0, 0),
    isPackage: toBool(row.isPackage ?? row.is_package ?? false),
    featured: toBool(row.featured ?? row.isFeatured ?? false),
    inStock: toBool(row.inStock ?? row.in_stock ?? true),
    isLaunch: toBool(row.isLaunch ?? row.is_launch ?? false),
    extraInfo: row.extraInfo ?? undefined,

    // mantém as colunas de preço também
    price_cpf_atacado: toNumber(row.price_cpf_atacado, 0),
    price_cpf_varejo: toNumber(row.price_cpf_varejo, 0),
    price_cnpj_atacado: toNumber(row.price_cnpj_atacado, 0),
    price_cnpj_varejo: toNumber(row.price_cnpj_varejo, 0),
  };

  return stampFinalPrice(base, finalPrice) as Product;
}

/* --------------------------------------------------------
   PAGE
-------------------------------------------------------- */
const FavoritesPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const customer: any = safeGetCustomer();

  const isLogged =
    !!customer?.id || !!customer?.document || !!customer?.cpf || !!customer?.cpf_cnpj;

  const displayName = customer?.name ?? customer?.full_name ?? "Cliente";

  const customerId = useMemo(() => (customer?.id ? String(customer.id) : ""), [customer?.id]);

  const sessionDocRaw = useMemo(
    () => customer?.document ?? customer?.cpf ?? customer?.cpf_cnpj ?? "",
    [customer?.document, customer?.cpf, customer?.cpf_cnpj]
  );
  const docDigits = useMemo(() => onlyDigits(sessionDocRaw), [sessionDocRaw]);
  const docPadded = useMemo(() => padDoc(docDigits), [docDigits]);

  const [pricingTick, setPricingTick] = useState(0);
  useEffect(() => {
    const onPricing = () => setPricingTick((t) => t + 1);
    const onStorage = (e: StorageEvent) => {
      if (e.key === "pricing_context") setPricingTick((t) => t + 1);
    };
    window.addEventListener("pricing_context_changed" as any, onPricing);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("pricing_context_changed" as any, onPricing);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  void pricingTick;
  const ctx = getPricingContext();

  // ✅ login guard
  useEffect(() => {
    if (!isLogged) navigate(ROUTES.login, { replace: true });
  }, [isLogged, navigate]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);

  const [searchTerm, setSearchTerm] = useState("");

  const fetchFavorites = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);

      const canQueryById = !!customerId;
      const canQueryByDoc = !!docDigits || !!docPadded;

      if (!canQueryById && !canQueryByDoc) {
        setProducts([]);
        return;
      }

      let favQuery = supabase.from("favorites").select("*").limit(500);
      if (canQueryById) favQuery = favQuery.eq("customer_id", customerId);
      else favQuery = favQuery.eq("customer_document", docDigits || docPadded);

      const { data: favRows, error: favErr } = await favQuery;
      if (favErr) throw favErr;

      const rows = (favRows ?? []) as any[];
      if (rows.length === 0) {
        setProducts([]);
        return;
      }

      const oldIds = rows
        .map((r) => r.product_old_id ?? r.product_old_id_id ?? r.product_oldid ?? null)
        .filter((v) => v !== null && v !== undefined)
        .map((v) => Number(v))
        .filter((n) => Number.isFinite(n)) as number[];

      const productIds = rows
        .map((r) => r.product_id ?? r.product_uuid ?? null)
        .filter(Boolean)
        .map((v) => String(v)) as string[];

      const loadedProductsRaw: any[] = [];

      if (oldIds.length > 0) {
        const { data: prodsByOld, error: prodsErr } = await supabase
          .from("products")
          .select("*")
          .in("old_id", Array.from(new Set(oldIds)));

        if (prodsErr) throw prodsErr;
        loadedProductsRaw.push(...(prodsByOld ?? []));
      }

      if (productIds.length > 0) {
        const { data: prodsById, error: prodsErr2 } = await supabase
          .from("products")
          .select("*")
          .in("id", Array.from(new Set(productIds)));

        if (prodsErr2) throw prodsErr2;
        loadedProductsRaw.push(...(prodsById ?? []));
      }

      const productMap = new Map<string, Product>();

      for (const p of loadedProductsRaw) {
        const mapped = mapSupabaseProduct(p, ctx);
        productMap.set(String((mapped as any).id), mapped);
        if ((mapped as any).old_id != null) productMap.set(`old:${(mapped as any).old_id}`, mapped);
      }

      const finalList: Product[] = [];
      const seen = new Set<string>();

      rows.forEach((r) => {
        const oi = r.product_old_id ?? r.product_old_id_id ?? r.product_oldid ?? null;
        const pi = r.product_id ?? r.product_uuid ?? null;

        let found: Product | undefined;

        if (oi != null) found = productMap.get(`old:${Number(oi)}`);
        if (!found && pi != null) found = productMap.get(String(pi));
        if (!found && oi != null) found = productMap.get(String(oi));

        if (found) {
          const key = String((found as any).id);
          if (!seen.has(key)) {
            seen.add(key);
            finalList.push(found);
          }
        }
      });

      setProducts(finalList);
    } catch (err: any) {
      setLoadError(err?.message ?? "Erro ao carregar favoritos.");
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [customerId, docDigits, docPadded, ctx]);

  useEffect(() => {
    if (isLogged) fetchFavorites();
  }, [fetchFavorites, isLogged]);

  useEffect(() => {
    const onFocus = () => fetchFavorites();
    const onVisibility = () => {
      if (document.visibilityState === "visible") fetchFavorites();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchFavorites]);

  // ✅ quando muda pricing_context, refaz a lista já com o preço novo
  useEffect(() => {
    if (!isLogged) return;
    fetchFavorites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pricingTick]);

  const filtered = useMemo(() => {
    const q = normalizeForSearch(searchTerm).trim();
    if (!q) return products;

    return products.filter((p) => {
      const name = normalizeForSearch((p as any).name);
      const cat = normalizeForSearch((p as any).category ?? "");
      const id = normalizeForSearch(String((p as any).id));
      const oldId = (p as any).old_id != null ? normalizeForSearch(String((p as any).old_id)) : "";
      return name.includes(q) || cat.includes(q) || id.includes(q) || (oldId && oldId.includes(q));
    });
  }, [products, searchTerm]);

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

  // ✅ Sidebar (mesma proporção do Index)
  const selectableBtn = (active: boolean) =>
    `
      w-full rounded-2xl px-4 py-[20px] text-left
      border transition-all duration-200
      flex items-center gap-3
      ${
        active
          ? "bg-gradient-to-br from-gray-950 via-gray-900 to-gray-800 text-white border-black/30 ring-2 ring-black/10 scale-[1.01]"
          : "bg-white border-gray-200 text-gray-900 hover:bg-gray-50"
      }
      active:scale-[0.99]
    `;

  const SidebarLink: React.FC<{
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
    active?: boolean;
  }> = ({ label, icon, onClick, active = false }) => {
    return (
      <button onClick={onClick} type="button" className={selectableBtn(active)}>
        <span className="shrink-0">{icon}</span>
        <span className="text-[20px] font-extrabold line-clamp-1">{label}</span>
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-[#f6f7f9]">
      {/* HERO (mantido) */}
      <section className="px-5 pt-5">
        <div className="relative overflow-hidden rounded-[28px] bg-white border border-gray-200 shadow-sm">
          <div className="h-[160px] w-full bg-gray-100 overflow-hidden">
            <div className="h-full w-full grid place-items-center">
              <img src={logoGostinho} alt="GM" className="h-16 opacity-80" />
            </div>
          </div>

          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />

          <div className="absolute left-5 right-5 bottom-4 text-white">
            <div className="text-[11px] font-extrabold tracking-[0.2em] opacity-90 uppercase">
              Minha lista
            </div>

            <div className="mt-1 text-[22px] font-extrabold leading-tight line-clamp-1">
              Favoritos
            </div>

            <div className="mt-1 text-[13px] opacity-90 line-clamp-1">
              {displayName}
              {ctx ? ` • ${ctx.channel.toUpperCase()}` : ""}
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <button
                onClick={() => navigate(ROUTES.catalog)}
                className="h-12 px-6 rounded-2xl bg-white text-black font-extrabold hover:bg-gray-100 active:scale-[0.99]"
              >
                Voltar ao catálogo
              </button>

              <div className="inline-flex items-center gap-2 rounded-2xl bg-white/20 backdrop-blur border border-white/25 px-5 h-12">
                <Heart className="h-5 w-5" />
                <span className="text-[13px] font-extrabold">
                  {loading ? "…" : `${products.length} itens`}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* BUSCA (igual Index) */}
      <div className="sticky top-0 z-40 bg-[#f6f7f9] px-5 pt-5 pb-5">
        <div className="relative">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-6 w-6 text-gray-400" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar nos favoritos (nome, categoria, código)..."
            className="
              h-16 pl-14 pr-5
              rounded-[24px]
              bg-white border border-gray-200
              shadow-[0_10px_24px_rgba(0,0,0,0.06)]
              text-[17px] font-semibold
              placeholder:text-gray-400
              focus-visible:ring-2 focus-visible:ring-black/10
            "
            inputMode="search"
          />
        </div>
      </div>

      <main className="px-5 pb-28">
        {loadError && (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700 font-semibold">
            Erro: {loadError}
          </div>
        )}

        {/* GRID (igual Index) */}
        <div className="grid grid-cols-[320px_1fr] gap-6 items-start">
          {/* SIDEBAR (igual Index) */}
          <aside className="self-start sticky top-[112px] h-[calc(100dvh-128px)]">
            <div className="h-full rounded-[26px] border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col">
              <div className="p-4 flex flex-col gap-3">
                <SidebarLink
                  label="Catálogo"
                  icon={<ChevronLeft className="h-5 w-5" />}
                  onClick={() => navigate(ROUTES.catalog)}
                  active={isActiveRoute(ROUTES.catalog)}
                />

                <SidebarLink
                  label="Favoritos"
                  icon={<Heart className="h-5 w-5" />}
                  onClick={() => navigate(ROUTES.favorites)}
                  active={isActiveRoute(ROUTES.favorites)}
                />

                <SidebarLink
                  label="Últimos pedidos"
                  icon={<History className="h-5 w-5" />}
                  onClick={() => navigate(ROUTES.lastOrders)}
                  active={isActiveRoute(ROUTES.lastOrders)}
                />

                <SidebarLink
                  label="Avisos"
                  icon={<Bell className="h-5 w-5" />}
                  onClick={() => navigate(ROUTES.notices)}
                  active={isActiveRoute(ROUTES.notices)}
                />

                <div className="h-px bg-gray-100 my-1" />
              </div>

              {/* SAIR (mesmo padrão do Index) */}
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

          {/* PRODUTOS */}
          <section className="min-w-0">
            <div className="rounded-[28px] border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="p-4 border-b border-gray-100 flex items-end justify-between">
                <div>
                  <div className="text-[16px] font-extrabold text-gray-900">Meus Favoritos</div>
                  <div className="text-[12px] text-gray-500 mt-1">
                    Toque no produto para ver detalhes/adicionar
                  </div>
                </div>

                {!loading && (
                  <div className="text-[12px] text-gray-500 font-semibold">{filtered.length} itens</div>
                )}
              </div>

              <div className="p-4 pb-10">
                {loading ? (
                  <div className="text-gray-500 font-semibold">Carregando...</div>
                ) : products.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-6 text-center">
                    <div className="mx-auto h-12 w-12 rounded-2xl bg-white border border-gray-200 grid place-items-center">
                      <Heart className="h-6 w-6 text-gray-600" />
                    </div>
                    <div className="mt-3 text-[15px] font-extrabold text-gray-900">
                      Nenhum favorito ainda
                    </div>
                    <div className="mt-1 text-[13px] text-gray-600">
                      Toque no ❤️ no produto no catálogo para aparecer aqui.
                    </div>
                    <button
                      onClick={() => navigate(ROUTES.catalog)}
                      className="mt-4 h-12 px-6 rounded-2xl bg-black text-white font-extrabold hover:bg-black/90 active:scale-[0.99]"
                    >
                      Ver catálogo
                    </button>
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="text-gray-500 font-semibold">Nenhum favorito encontrado nessa busca.</div>
                ) : (
                  <div className="grid grid-cols-2 gap-6">
                    {filtered.map((p) => (
                      <ProductCard key={String((p as any).id)} product={p} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </main>

      <CartToggle />
      <Cart />
    </div>
  );
};

export default FavoritesPage;
