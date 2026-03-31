// src/pages/Destaques.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import FeaturedProductsCarousel from "@/components/FeaturedProductsCarousel";
import ProductCard from "@/components/ProductCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getChannelBasePrice } from "@/utils/productPricing";
import { getCustomerSessionSnapshot } from "@/utils/customerSession";

import {
  Star,
  Search,
  X,
  Loader2,
  AlertTriangle,
  Eye,
  Settings,
  Save,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  CheckCircle2,
} from "lucide-react";

/* --------------------------------------------------------
   ROUTES (igual Index)
-------------------------------------------------------- */
const ROUTES = {
  catalog: "/catalogo",
  favorites: "/favoritos",
  lastOrders: "/meus-pedidos",
  notices: "/avisos",
  featured: "/destaques",
  login: "/login",
};

/* --------------------------------------------------------
  HELPERS
-------------------------------------------------------- */
function safeGetSession() {
  return getCustomerSessionSnapshot();
}

function normalizeForSearch(text: string) {
  return (text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "");
}

function isMissingRelation(err: any) {
  const msg = String(err?.message ?? "");
  return (
    err?.code === "42P01" ||
    msg.toLowerCase().includes("does not exist") ||
    msg.toLowerCase().includes("relation")
  );
}

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

type CarouselMode = "auto" | "manual";

type ProductLite = {
  id: string;
  name: string;
  image_path?: string | null;
  images?: string[] | null;
  price?: number | null;
  employee_price?: number | null;
  unit?: string | null;
  category?: string | null;
};

type FeaturedPosRow = {
  position: number;
  product_id: string;
  active: boolean;
};

type TopProduct = {
  product_id: string;
  product_name: string;
  total_quantity: number;
  total_value: number;
  image_path: string | null;
};

/* --------------------------------------------------------
  UI HELPERS
-------------------------------------------------------- */
function Banner({
  tone,
  title,
  description,
  onClose,
}: {
  tone: "warn" | "info" | "success";
  title: string;
  description?: string;
  onClose?: () => void;
}) {
  const toneClasses =
    tone === "warn"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : "border-blue-200 bg-blue-50 text-blue-900";

  const Icon =
    tone === "warn" ? AlertTriangle : tone === "success" ? CheckCircle2 : Eye;

  return (
    <div className={`rounded-2xl border p-3 ${toneClasses}`}>
      <div className="flex items-start gap-2">
        <Icon className="h-5 w-5 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="font-semibold whitespace-pre-line">{title}</div>
          {description ? (
            <div className="text-xs opacity-90 mt-0.5 whitespace-pre-line">
              {description}
            </div>
          ) : null}
        </div>

        {onClose ? (
          <button
            onClick={onClose}
            className="h-9 w-9 rounded-2xl bg-white/60 border hover:bg-white transition flex items-center justify-center active:scale-[0.99]"
            aria-label="Fechar aviso"
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

/* --------------------------------------------------------
  PAGE
-------------------------------------------------------- */
const Destaques: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const sess: any = safeGetSession();

  const canEditFeatured =
    String(sess?.role ?? "").toLowerCase() === "admin" ||
    sess?.is_admin === true ||
    sess?.admin === true ||
    sess?.isAdmin === true;

  const LIMIT = 5;

  const [mode, setMode] = useState<CarouselMode>("manual");
  const [loading, setLoading] = useState(false);

  const [items, setItems] = useState<ProductLite[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [errorTone, setErrorTone] = useState<"warn" | "info" | "success">("warn");

  const [query, setQuery] = useState("");

  // Editor state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorLoading, setEditorLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState<ProductLite[]>([]);
  const [selected, setSelected] = useState<ProductLite[]>([]);
  const [editorMsg, setEditorMsg] = useState<string | null>(null);
  const [editorMsgTone, setEditorMsgTone] = useState<"warn" | "info" | "success">(
    "info"
  );

  // ✅ se quiser exigir login
  useEffect(() => {
    const hasAnySession = !!localStorage.getItem("customer_session");

    if (!hasAnySession) navigate(ROUTES.login, { replace: true });
  }, [navigate]);

  function mapProducts(rows: any[]): ProductLite[] {
    return (rows ?? []).map((row: any) => {
      const categoryName =
        CATEGORY_NAME_BY_ID[row.category_id as number] ??
        row.category ??
        row.category_name ??
        "Outros";

      const imagesArr: string[] =
        (Array.isArray(row.images) ? row.images : null) ??
        (row.image ? [row.image] : []);

      return {
        id: String(row.id),
        name: row.name ?? "",
        image_path: row.image_path ?? null,
        images: imagesArr,
        price: getChannelBasePrice(row, "varejo"),
        employee_price: getChannelBasePrice(row, "atacado"),
        unit: row.unit ?? row.unidade ?? null,
        category: categoryName,
      };
    });
  }

  async function loadFeaturedManual() {
    const { data: rows, error: err1 } = await supabase
      .from("featured_products")
      .select("position, product_id, active")
      .eq("active", true)
      .order("position", { ascending: true })
      .limit(LIMIT);

    if (err1) throw err1;

    const ordered = ((rows as FeaturedPosRow[]) ?? []).filter(Boolean);
    const ids = ordered.map((r) => r.product_id).filter(Boolean);
    if (!ids.length) return [];

    const { data: prods, error: err2 } = await supabase
      .from("products")
      .select("*")
      .in("id", ids);

    if (err2) throw err2;

    const mapById = new Map<string, any>();
    (prods as any[] | null | undefined)?.forEach((p) =>
      mapById.set(String(p.id), p)
    );

    const sorted = ordered
      .map((r) => mapById.get(String(r.product_id)))
      .filter(Boolean);

    return mapProducts(sorted);
  }

  async function loadFeaturedAuto() {
    const { data, error } = await supabase.rpc("get_top_selling_products", {
      limit_count: LIMIT,
    });

    if (error) throw error;

    const top = (data as TopProduct[]) ?? [];
    const ids = top.map((t) => t.product_id).filter(Boolean);
    if (!ids.length) return [];

    const { data: prods, error: err2 } = await supabase
      .from("products")
      .select("*")
      .in("id", ids);

    if (err2) throw err2;

    const byId = new Map<string, any>();
    (prods as any[] | null | undefined)?.forEach((p) =>
      byId.set(String(p.id), p)
    );

    const sorted = ids.map((id) => byId.get(String(id))).filter(Boolean);
    return mapProducts(sorted);
  }

  async function loadAll() {
    setLoading(true);
    setErrorMsg(null);
    setErrorTone("warn");

    try {
      const { data: settings, error: sErr } = await supabase
        .from("carousel_settings")
        .select("mode")
        .eq("id", 1)
        .maybeSingle();

      if (sErr) throw sErr;

      const modeFromDb: CarouselMode = (settings?.mode as CarouselMode) || "manual";
      setMode(modeFromDb);

      const list =
        modeFromDb === "auto" ? await loadFeaturedAuto() : await loadFeaturedManual();

      setItems(list);

      if (!list.length) {
        setErrorTone("info");
        setErrorMsg(
          modeFromDb === "auto"
            ? "Ainda não há produtos suficientes para montar os destaques automáticos."
            : "Nenhum destaque manual configurado ainda."
        );
      }
    } catch (e: any) {
      setItems([]);
      setErrorTone("warn");

      // melhora mensagem se for tabela faltando
      if (isMissingRelation(e)) {
        setErrorMsg(
          'Tabelas de destaques ainda não existem (ex.: "featured_products" / "carousel_settings").'
        );
      } else {
        setErrorMsg(
          e?.message ? `Erro ao carregar destaques: ${e.message}` : "Erro ao carregar destaques."
        );
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------- Editor helpers --------
  async function openEditor() {
    setEditorMsg(null);
    setEditorMsgTone("info");
    setEditorLoading(true);
    setEditorOpen(true);

    try {
      const { data: settings, error: sErr } = await supabase
        .from("carousel_settings")
        .select("mode")
        .eq("id", 1)
        .maybeSingle();
      if (sErr) throw sErr;

      const m = (settings?.mode as CarouselMode) || "manual";
      setMode(m);

      if (m !== "manual") {
        setEditorMsgTone("warn");
        setEditorMsg(
          "O modo de destaques está como Automático.\n\nPara editar pela página, troque para Manual na tabela carousel_settings (mode='manual')."
        );
      }

      const current = await loadFeaturedManual();
      setSelected(current);
    } catch (e: any) {
      setEditorMsgTone("warn");
      setEditorMsg(e?.message ? `Erro ao abrir editor: ${e.message}` : "Erro ao abrir editor.");
    } finally {
      setEditorLoading(false);
    }
  }

  async function searchProducts(term: string) {
    const q = term.trim();
    if (!q) {
      setProductResults([]);
      return;
    }

    const { data, error } = await supabase.from("products").select("*").limit(80);
    if (error) throw error;

    const mapped = mapProducts((data as any[]) ?? []);
    const nq = normalizeForSearch(q);

    const filtered = mapped.filter((p) => {
      const name = normalizeForSearch(p.name);
      const cat = normalizeForSearch(p.category ?? "");
      const unit = normalizeForSearch(p.unit ?? "");
      const id = normalizeForSearch(String(p.id));
      return name.includes(nq) || cat.includes(nq) || unit.includes(nq) || id.includes(nq);
    });

    const selectedIds = new Set(selected.map((s) => String(s.id)));
    setProductResults(filtered.filter((p) => !selectedIds.has(String(p.id))).slice(0, 30));
  }

  function addSelected(p: ProductLite) {
    setEditorMsg(null);

    setSelected((prev) => {
      if (prev.some((x) => String(x.id) === String(p.id))) return prev;
      if (prev.length >= LIMIT) {
        setEditorMsgTone("warn");
        setEditorMsg(`Você só pode selecionar até ${LIMIT} produtos.`);
        return prev;
      }
      return [...prev, p];
    });

    setProductResults((prev) => prev.filter((x) => String(x.id) !== String(p.id)));
  }

  function removeSelected(id: string) {
    setEditorMsg(null);
    setSelected((prev) => prev.filter((p) => String(p.id) !== String(id)));
  }

  function moveSelected(index: number, dir: -1 | 1) {
    setSelected((prev) => {
      const next = [...prev];
      const to = index + dir;
      if (to < 0 || to >= next.length) return prev;
      const tmp = next[index];
      next[index] = next[to];
      next[to] = tmp;
      return next;
    });
  }

  async function saveFeatured() {
    setSaveLoading(true);
    setEditorMsg(null);

    try {
      if (mode !== "manual") {
        setEditorMsgTone("warn");
        setEditorMsg("Para salvar destaques pela página, o modo precisa estar Manual.");
        return;
      }

      const { error: e1 } = await supabase
        .from("featured_products")
        .update({ active: false })
        .eq("active", true);

      if (e1) throw e1;

      if (selected.length > 0) {
        const payload = selected.map((p, idx) => ({
          position: idx + 1,
          product_id: String(p.id),
          active: true,
        }));

        const { error: e2 } = await supabase.from("featured_products").insert(payload);
        if (e2) throw e2;
      }

      setEditorMsgTone("success");
      setEditorMsg("Destaques salvos com sucesso!");
      await loadAll();
    } catch (e: any) {
      setEditorMsgTone("warn");
      setEditorMsg(e?.message ? `Erro ao salvar: ${e.message}` : "Erro ao salvar.");
    } finally {
      setSaveLoading(false);
    }
  }

  const filtered = useMemo(() => {
    const q = normalizeForSearch(query);
    if (!q) return items;

    return items.filter((p) => {
      const name = normalizeForSearch(p.name);
      const cat = normalizeForSearch(p.category ?? "");
      const unit = normalizeForSearch(p.unit ?? "");
      const id = normalizeForSearch(String(p.id));
      return name.includes(q) || cat.includes(q) || unit.includes(q) || id.includes(q);
    });
  }, [items, query]);

  const previewItems = useMemo(() => {
    return filtered.map((p) => {
      const productForCard: any = {
        id: p.id,
        name: p.name,
        price: Number(p.employee_price ?? p.price ?? 0),
        employee_price: Number(p.employee_price ?? p.price ?? 0),
        images: p.images ?? [],
        image_path: p.image_path ?? null,
        category: p.category ?? "Outros",
        description: "",
        packageInfo: "",
        weight: 0,
        isPackage: false,
        featured: true,
        inStock: true,
        isLaunch: false,
      };

      return (
        <div
          key={p.id}
          className={`
            w-[330px] shrink-0
            [&_button[aria-label^='Imagem do produto']]:w-full
            [&_button[aria-label^='Imagem do produto']]:h-[190px]
            [&_button[aria-label^='Imagem do produto']]:rounded-2xl
            [&_button[aria-label^='Imagem do produto']]:overflow-hidden
            [&_button[aria-label^='Imagem do produto']_img]:w-full
            [&_button[aria-label^='Imagem do produto']_img]:h-full
            [&_button[aria-label^='Imagem do produto']_img]:object-contain
          `}
        >
          <ProductCard product={productForCard} hideImages={false} />
        </div>
      );
    });
  }, [filtered]);

  /* --------------------------------------------------------
     UI helpers (Index vibe)
  -------------------------------------------------------- */
  const isActiveRoute = (path: string) => {
    const cur = location?.pathname ?? "";
    if (!path) return false;
    return cur === path || cur.startsWith(path + "/");
  };

  const selectableBtn = (active: boolean) =>
    `
      w-full rounded-2xl px-3 py-2.5 text-left
      border transition-all duration-200
      flex items-center gap-2
      ${active ? "bg-black text-white border-black ring-2 ring-black/15 scale-[1.01]" : "bg-white border-gray-200 text-gray-900 hover:bg-gray-50"}
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
        <span className="text-[12.5px] line-clamp-1">{label}</span>
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-[#f6f7f9]">
      {/* ✅ TOP BAR (totem) */}
      <div className="sticky top-0 z-40 bg-[#f6f7f9] px-5 pt-5 pb-4">
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => navigate(ROUTES.catalog)}
            type="button"
            className="
              h-11 px-4 rounded-2xl bg-white border border-gray-200 shadow-sm
              font-extrabold text-[13px]
              hover:bg-gray-50 active:scale-[0.99]
              flex items-center gap-2
            "
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar ao catálogo
          </button>

          <div className="inline-flex items-center gap-2 rounded-2xl bg-white border border-gray-200 shadow-sm px-4 h-11">
            <Star className="h-4 w-4" />
            <span className="font-extrabold text-[13px]">Destaques</span>
            <span className="text-[12px] text-gray-500 font-semibold hidden md:inline">
              • Modo: <span className="text-gray-900">{mode === "auto" ? "Automático" : "Manual"}</span>
            </span>
          </div>

          {canEditFeatured ? (
            <button
              onClick={openEditor}
              className="
                h-11 px-4 rounded-2xl bg-black text-white font-extrabold
                hover:bg-black/90 active:scale-[0.99]
                flex items-center gap-2
              "
              type="button"
              title="Editar destaques"
            >
              <Settings className="h-4 w-4" />
              Editar
            </button>
          ) : (
            <div className="h-11 w-[98px]" />
          )}
        </div>
      </div>

      {/* ✅ BUSCA STICKY (igual Index) */}
      <div className="sticky top-[88px] z-40 bg-[#f6f7f9] px-5 pb-4">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar nos destaques (nome, categoria, unidade, código)..."
            className="h-12 pl-12 pr-12 rounded-2xl bg-white border border-gray-200 shadow-sm text-[15px]"
            inputMode="search"
          />
          <button
            type="button"
            onClick={() => setQuery("")}
            className="
              absolute right-2 top-1/2 -translate-y-1/2
              h-9 w-9 rounded-2xl border border-gray-200 bg-white
              hover:bg-gray-50 active:scale-[0.99]
              flex items-center justify-center
            "
            aria-label="Limpar busca"
            title="Limpar busca"
          >
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>
      </div>

      <main className="px-5 pb-28">
        <div className="grid grid-cols-[250px_1fr] gap-6 items-start">
          {/* SIDEBAR (totem) */}
          <aside className="self-start sticky top-[148px]">
            <div className="rounded-[26px] border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <div className="text-[14px] font-extrabold text-gray-900">Atalhos</div>
                <div className="text-[11px] text-gray-500 mt-1">Navegação rápida</div>
              </div>

              <div className="p-3 flex flex-col gap-2">
                <SidebarLink
                  label="Catálogo"
                  icon={<ArrowLeft className="h-4 w-4" />}
                  onClick={() => navigate(ROUTES.catalog)}
                  active={isActiveRoute(ROUTES.catalog)}
                />
                <SidebarLink
                  label="Avisos"
                  icon={<Eye className="h-4 w-4" />}
                  onClick={() => navigate(ROUTES.notices)}
                  active={isActiveRoute(ROUTES.notices)}
                />
                <SidebarLink
                  label="Favoritos"
                  icon={<Star className="h-4 w-4" />}
                  onClick={() => navigate(ROUTES.favorites)}
                  active={isActiveRoute(ROUTES.favorites)}
                />
                <SidebarLink
                  label="Últimos pedidos"
                  icon={<Eye className="h-4 w-4" />}
                  onClick={() => navigate(ROUTES.lastOrders)}
                  active={isActiveRoute(ROUTES.lastOrders)}
                />
              </div>
            </div>

            {canEditFeatured && (
              <div className="mt-4 rounded-[26px] border border-gray-200 bg-white shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100">
                  <div className="text-[14px] font-extrabold text-gray-900">Admin</div>
                  <div className="text-[11px] text-gray-500 mt-1">Destaques</div>
                </div>
                <div className="p-3">
                  <button
                    onClick={openEditor}
                    type="button"
                    className="
                      w-full rounded-2xl px-3 py-2.5 text-left
                      border border-gray-200 bg-white
                      hover:bg-gray-50 transition-all duration-200
                      flex items-center gap-2
                      active:scale-[0.99]
                    "
                  >
                    <Settings className="h-4 w-4 text-gray-700" />
                    <span className="font-extrabold text-[12.5px] text-gray-900">
                      Editar destaques
                    </span>
                  </button>
                </div>
              </div>
            )}
          </aside>

          {/* CONTENT */}
          <section className="min-w-0">
            <div className="rounded-[28px] border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="p-4 border-b border-gray-100 flex items-end justify-between gap-3">
                <div>
                  <div className="text-[16px] font-extrabold text-gray-900">Produtos em destaque</div>
                  <div className="text-[12px] text-gray-500 mt-1">
                    Toque no produto para ver detalhes/adicionar
                  </div>
                </div>

                {!loading && (
                  <div className="text-[12px] text-gray-500 font-semibold">
                    {filtered.length} itens
                  </div>
                )}
              </div>

              <div className="p-4 pb-10">
                {loading ? (
                  <div className="rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-600 inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Carregando destaques...
                  </div>
                ) : errorMsg ? (
                  <Banner
                    tone={errorTone}
                    title={
                      errorTone === "info"
                        ? "Ainda não há destaques"
                        : "Não foi possível carregar os destaques"
                    }
                    description={errorMsg}
                    onClose={() => setErrorMsg(null)}
                  />
                ) : filtered.length === 0 ? (
                  <Banner
                    tone="info"
                    title="Nenhum destaque encontrado"
                    description="Tente limpar a busca ou procure por outro termo."
                  />
                ) : (
                  <>
                    {/* CARROSSEL */}
                    <div className="mb-5">
                      <FeaturedProductsCarousel
                        title="Em destaque"
                        items={previewItems}
                        speedPxPerSec={35}
                        itemMinWidth={340}
                        gap={20}
                      />
                    </div>

                    {/* GRID */}
                    <div className="grid grid-cols-2 gap-5">
                      {filtered.map((p) => {
                        const productForCard: any = {
                          id: p.id,
                          name: p.name,
                          price: Number(p.employee_price ?? p.price ?? 0),
                          employee_price: Number(p.employee_price ?? p.price ?? 0),
                          images: p.images ?? [],
                          image_path: p.image_path ?? null,
                          category: p.category ?? "Outros",
                          description: "",
                          packageInfo: "",
                          weight: 0,
                          isPackage: false,
                          featured: true,
                          inStock: true,
                          isLaunch: false,
                        };

                        return <ProductCard key={p.id} product={productForCard} hideImages={false} />;
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* ---------------- Editor Modal (totem) ---------------- */}
      {editorOpen ? (
        <div className="fixed inset-0 z-[70]">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => !saveLoading && setEditorOpen(false)}
          />
          <div
            className="
              absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
              w-[92vw] max-w-5xl
              rounded-[28px] bg-white border border-gray-200 shadow-xl
              p-4 sm:p-5
            "
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[18px] font-extrabold flex items-center gap-2 text-gray-900">
                  <Settings className="h-5 w-5" />
                  Editar Destaques (Manual)
                </div>
                <div className="text-[12px] text-gray-500 mt-1">
                  Selecione até <b>{LIMIT}</b> produtos e defina a ordem.
                </div>
              </div>

              <button
                onClick={() => !saveLoading && setEditorOpen(false)}
                className="h-10 w-10 rounded-2xl border border-gray-200 bg-white hover:bg-gray-50 flex items-center justify-center active:scale-[0.99]"
                aria-label="Fechar editor"
                type="button"
              >
                <X className="h-4 w-4 text-gray-600" />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Selected */}
              <div className="rounded-[24px] border border-gray-200 p-3">
                <div className="flex items-center justify-between">
                  <div className="font-extrabold text-[13px] text-gray-900">
                    Selecionados ({selected.length}/{LIMIT})
                  </div>
                  <div className="text-[11px] text-gray-500 font-semibold">Ordem = position</div>
                </div>

                {editorLoading ? (
                  <div className="mt-3 text-sm text-gray-600 inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Carregando...
                  </div>
                ) : selected.length === 0 ? (
                  <div className="mt-3">
                    <Banner
                      tone="info"
                      title="Nenhum produto selecionado"
                      description="Use a busca ao lado para adicionar produtos."
                    />
                  </div>
                ) : (
                  <div className="mt-3 space-y-2">
                    {selected.map((p, idx) => (
                      <div
                        key={p.id}
                        className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-gray-50 p-2"
                      >
                        <div className="w-10 h-10 rounded-2xl bg-white border border-gray-200 flex items-center justify-center text-[12px] font-extrabold text-gray-700">
                          {idx + 1}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] font-extrabold truncate text-gray-900">
                            {p.name}
                          </div>
                          <div className="text-[11px] text-gray-500 truncate font-semibold">
                            {p.category ?? "Outros"} • {p.unit ?? "un"}
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => moveSelected(idx, -1)}
                            disabled={idx === 0}
                            className="h-10 w-10 rounded-2xl border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 flex items-center justify-center active:scale-[0.99]"
                            title="Subir"
                            type="button"
                          >
                            <ArrowUp className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => moveSelected(idx, 1)}
                            disabled={idx === selected.length - 1}
                            className="h-10 w-10 rounded-2xl border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 flex items-center justify-center active:scale-[0.99]"
                            title="Descer"
                            type="button"
                          >
                            <ArrowDown className="h-4 w-4" />
                          </button>

                          <button
                            onClick={() => removeSelected(p.id)}
                            className="h-10 w-10 rounded-2xl border border-gray-200 bg-white hover:bg-red-50 flex items-center justify-center active:scale-[0.99]"
                            title="Remover"
                            type="button"
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-3 flex items-center justify-end gap-2">
                  <Button
                    onClick={saveFeatured}
                    disabled={saveLoading || editorLoading}
                    className="h-11 rounded-2xl font-extrabold gap-2"
                  >
                    {saveLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" />
                        Salvar destaques
                      </>
                    )}
                  </Button>
                </div>

                {editorMsg ? (
                  <div className="mt-3">
                    <Banner
                      tone={editorMsgTone}
                      title={
                        editorMsgTone === "success"
                          ? "Tudo certo"
                          : editorMsgTone === "warn"
                          ? "Atenção"
                          : "Info"
                      }
                      description={editorMsg}
                      onClose={() => setEditorMsg(null)}
                    />
                  </div>
                ) : null}
              </div>

              {/* Search + results */}
              <div className="rounded-[24px] border border-gray-200 p-3">
                <div className="font-extrabold text-[13px] text-gray-900">Buscar produtos</div>

                <div className="mt-2 relative">
                  <Search className="h-5 w-5 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                  <Input
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="Buscar por nome, categoria, unidade, código..."
                    className="h-12 pl-12 pr-12 rounded-2xl bg-white border border-gray-200 shadow-sm text-[15px]"
                    onKeyDown={async (e) => {
                      if (e.key === "Enter") {
                        try {
                          setEditorLoading(true);
                          await searchProducts(productSearch);
                        } catch (err: any) {
                          setEditorMsgTone("warn");
                          setEditorMsg(
                            err?.message ? `Erro na busca: ${err.message}` : "Erro na busca."
                          );
                        } finally {
                          setEditorLoading(false);
                        }
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setProductSearch("");
                      setProductResults([]);
                    }}
                    className="
                      absolute right-2 top-1/2 -translate-y-1/2
                      h-9 w-9 rounded-2xl border border-gray-200 bg-white
                      hover:bg-gray-50 active:scale-[0.99]
                      flex items-center justify-center
                    "
                    aria-label="Limpar busca"
                    title="Limpar busca"
                  >
                    <X className="h-4 w-4 text-gray-500" />
                  </button>
                </div>

                <div className="mt-2 flex items-center justify-end">
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      try {
                        setEditorLoading(true);
                        await searchProducts(productSearch);
                      } catch (err: any) {
                        setEditorMsgTone("warn");
                        setEditorMsg(
                          err?.message ? `Erro na busca: ${err.message}` : "Erro na busca."
                        );
                      } finally {
                        setEditorLoading(false);
                      }
                    }}
                    className="h-11 rounded-2xl font-extrabold gap-2"
                    disabled={editorLoading}
                  >
                    {editorLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Buscando...
                      </>
                    ) : (
                      <>
                        <Search className="h-4 w-4" />
                        Buscar
                      </>
                    )}
                  </Button>
                </div>

                <div className="mt-3">
                  {productResults.length === 0 ? (
                    <div className="text-[12px] text-gray-500 font-semibold">
                      Digite algo e toque em <b>Buscar</b>.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[440px] overflow-auto pr-1">
                      {productResults.map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-white p-2"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="text-[13px] font-extrabold truncate text-gray-900">
                              {p.name}
                            </div>
                            <div className="text-[11px] text-gray-500 truncate font-semibold">
                              {p.category ?? "Outros"} • {p.unit ?? "un"}
                            </div>
                          </div>

                          <button
                            onClick={() => addSelected(p)}
                            className="
                              h-11 px-4 rounded-2xl border border-gray-200 bg-white
                              hover:bg-emerald-50 active:scale-[0.99]
                              flex items-center gap-2 text-[13px] font-extrabold
                            "
                            title="Adicionar"
                            type="button"
                          >
                            <Plus className="h-4 w-4 text-emerald-600" />
                            Adicionar
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-3 text-[11px] text-gray-500 font-semibold">
                  Dica: se o catálogo tiver muitos itens, posso trocar essa busca por <b>ilike</b> e paginação.
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end">
              <button
                onClick={() => !saveLoading && setEditorOpen(false)}
                type="button"
                className="h-11 px-4 rounded-2xl border border-gray-200 bg-white hover:bg-gray-50 font-extrabold active:scale-[0.99]"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default Destaques;
