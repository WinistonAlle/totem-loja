// src/pages/Admin.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import type { Product } from "@/types/products";
import { getChannelBasePrice } from "@/utils/productPricing";
import { APP_EVENT, emitAppEvent } from "@/lib/appEvents";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";

import {
  ArrowLeft,
  Search,
  Plus,
  X,
  Trash2,
  Image as ImageIcon,
  Shield,
  Package,
  Star,
  Boxes,
  Loader2,
  ChevronUp,
  ChevronDown,
  Pin,
  PinOff,
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
  productsCrud: "/admin",
};

/* --------------------------------------------------------
   CONSTS
-------------------------------------------------------- */
const FALLBACK_IMG = "/placeholder.png";
const STORAGE_BUCKET = "product-images";
const CATALOG_PRODUCTS_CACHE_KEY = "gm_catalog_products_v4";

/**
 * ✅ Regra didática:
 * 0..99 = "fixados no topo" (categoria "todas")
 * 999999 = ordem normal
 */
const PINNED_MAX = 99;
const DEFAULT_ORDER = 999999;

const CATEGORY_LABELS: Record<string, string> = {
  "1": "Pão de Queijo",
  "2": "Salgados Assados",
  "3": "Salgados P/ Fritar",
  "4": "Pães e Massas Doces",
  "5": "Biscoito de Queijo",
  "6": "Salgados Grandes",
  "7": "Alho em creme",
  "8": "Outros",
};

type Editable = Product & {
  images?: string[];
  image_path?: string | null;

  // ordem no catálogo
  display_order?: number;

  // preços 4 tabelas (no products)
  price_cpf_atacado?: number;
  price_cpf_varejo?: number;
  price_cnpj_atacado?: number;
  price_cnpj_varejo?: number;
  price_atacado?: number;
  price_varejo?: number;

  // inputs (aceita 3,5 / 3.5)
  price_cpf_atacado_input?: string;
  price_cpf_varejo_input?: string;
  price_cnpj_atacado_input?: string;
  price_cnpj_varejo_input?: string;
  price_atacado_input?: string;
  price_varejo_input?: string;

  // peso (tabela weight)
  weight_input?: string;
};

/* --------------------------------------------------------
   HELPERS
-------------------------------------------------------- */
function parseBRNumber(v: any, fallback = 0): number {
  if (v === null || v === undefined) return fallback;
  if (typeof v === "number") return Number.isFinite(v) ? v : fallback;

  const s = String(v).trim();
  if (!s) return fallback;

  const normalized = s.replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : fallback;
}

function pickUnifiedPrice(primary: any, secondary: any) {
  const primaryNum = safeNumber(primary, NaN);
  if (Number.isFinite(primaryNum)) return primaryNum;
  return safeNumber(secondary, 0);
}

function safeNumberOrNull(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = parseBRNumber(v, NaN);
  return Number.isFinite(n) ? n : null;
}

function safeNumber(v: any, fallback = 0): number {
  return parseBRNumber(v, fallback);
}

function normalizeImages(row: any): string[] {
  if (Array.isArray(row?.images)) return row.images.filter(Boolean);
  if (typeof row?.images === "string" && row.images.trim())
    return row.images
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean);

  if (row?.image && typeof row.image === "string") return [row.image];
  if (row?.image_path && typeof row.image_path === "string") return [row.image_path];
  return [];
}

function isMissingTableOrColumnError(err: any) {
  const msg = String(err?.message ?? "").toLowerCase();
  const details = String(err?.details ?? "").toLowerCase();
  const hint = String(err?.hint ?? "").toLowerCase();
  const code = String(err?.code ?? "").toLowerCase();
  const blob = `${msg} ${details} ${hint} ${code}`.trim();

  if (blob.includes("could not find the table")) return true;
  if (blob.includes("schema cache")) return true;
  if (blob.includes("relation") && blob.includes("does not exist")) return true;
  if (blob.includes("column") && blob.includes("does not exist")) return true;
  return false;
}

function extractMissingColumnName(err: any): string | null {
  const msg = String(err?.message ?? "");
  const m = msg.match(/Could not find the '([^']+)' column of '([^']+)'/i);
  if (m?.[1]) return m[1];
  return null;
}

function mapRowToProduct(row: any): Product {
  const categoryId =
    row.category_id ?? row.category ?? row.category_name ?? row.categoryId ?? null;

  const oldId = safeNumberOrNull(row.old_id);
  const images = normalizeImages(row);
  const anyRow: any = row;

  const p = {
    id: row.id,
    old_id: oldId,
    name: row.name ?? "",
    price: safeNumber(anyRow.price ?? anyRow.employee_price ?? 0, 0),
    employee_price: safeNumber(anyRow.employee_price ?? anyRow.price ?? 0, 0),

    images,
    image_path: row.image_path ?? (images[0] ?? null),

    category: categoryId != null ? String(categoryId) : ("8" as any),

    description: row.description ?? "",
    packageInfo: row.packageInfo ?? row.package_info ?? "",
    weight: safeNumber(row.weight, 0),

    isPackage: row.isPackage ?? row.is_package ?? false,
    featured: row.featured ?? row.isFeatured ?? false,
    inStock: row.inStock ?? row.in_stock ?? true,
    isLaunch: row.isLaunch ?? row.is_launch ?? false,
    extraInfo: row.extraInfo ?? row.extra_info ?? null,
  } as Product;

  // manter campos extras sem depender do type Product
  (p as any).display_order = safeNumber(anyRow.display_order, DEFAULT_ORDER);

  (p as any).price_cpf_atacado = safeNumber(anyRow.price_cpf_atacado, 0);
  (p as any).price_cpf_varejo = safeNumber(anyRow.price_cpf_varejo, 0);
  (p as any).price_cnpj_atacado = safeNumber(anyRow.price_cnpj_atacado, 0);
  (p as any).price_cnpj_varejo = safeNumber(anyRow.price_cnpj_varejo, 0);

  return p;
}

function mapEditingToDbPayload(editing: Editable) {
  const firstImage =
    editing.images && editing.images.length > 0 ? editing.images[0].trim() : null;
  const priceAtacado = parseBRNumber(
    editing.price_atacado_input ?? editing.price_atacado ?? editing.price_cpf_atacado,
    0
  );
  const priceVarejo = parseBRNumber(
    editing.price_varejo_input ?? editing.price_varejo ?? editing.price_cpf_varejo,
    0
  );

  const payload: any = {
    id: editing.id,
    old_id: safeNumberOrNull((editing as any).old_id),

    name: editing.name?.trim() ?? "",
    unit: "un",
    category_id: editing.category ? Number(editing.category) : null,

    image_path: (editing as any).image_path ?? firstImage,
    description: (editing as any).description ?? "",
    package_info: (editing as any).packageInfo ?? "",

    is_package: !!(editing as any).isPackage,
    featured: !!(editing as any).featured,
    is_launch: !!(editing as any).isLaunch,
    in_stock: (editing as any).inStock !== false,

    // ✅ ordem (nasce como 1000 por padrão, e "fixar no topo" usa 0..99)
    display_order: Math.max(0, Math.floor(safeNumber((editing as any).display_order, DEFAULT_ORDER))),

    price_cpf_atacado: priceAtacado,
    price_cpf_varejo: priceVarejo,
    price_cnpj_atacado: priceAtacado,
    price_cnpj_varejo: priceVarejo,
  };

  return payload;
}

function mapPayloadBackToProduct(editing: Editable, payload: any): Product {
  const images = (editing.images ?? []).filter(Boolean);
  const weightFinal = parseBRNumber(editing.weight_input ?? (editing as any).weight, 0);

  const anySaved: any = {
    ...editing,
    ...payload,
    images,
    weight: weightFinal,
  };

  return mapRowToProduct(anySaved);
}

function generateId() {
  const c: any = globalThis as any;
  if (c?.crypto?.randomUUID) return c.crypto.randomUUID();
  return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function isActiveRoute(curPath: string, path: string) {
  if (!path) return false;
  return curPath === path || curPath.startsWith(path + "/");
}

function formatMoneyBR(v: number) {
  return (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function getDisplayPrice(p: any) {
  return getChannelBasePrice(p, "varejo");
}

function getCatalogPositionLabel(p: any) {
  const order = getOrder(p);
  if (isPinned(p)) return `Topo #${order + 1}`;
  return "Ordem normal";
}

function getOrder(p: any) {
  const n = safeNumber(p?.display_order, DEFAULT_ORDER);
  return Number.isFinite(n) ? n : DEFAULT_ORDER;
}

function isPinned(p: any) {
  const o = getOrder(p);
  return o >= 0 && o <= PINNED_MAX;
}

function invalidateCatalogProductsCache() {
  try {
    localStorage.removeItem(CATALOG_PRODUCTS_CACHE_KEY);
  } catch {}
  emitAppEvent(APP_EVENT.catalogProductsChanged);
}

/* --------------------------------------------------------
   PAGE
-------------------------------------------------------- */
export default function Admin() {
  const navigate = useNavigate();
  const location = useLocation();

  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState<string>("todas");

  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<Editable | null>(null);

  const [toDelete, setToDelete] = useState<Product | null>(null);

  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [loadError, setLoadError] = useState<string | null>(null);

  /* --------------------------------------------------------
     Carregar produtos do Supabase
  -------------------------------------------------------- */
  useEffect(() => {
    let mounted = true;

    const fetchProducts = async () => {
      setLoading(true);
      setLoadError(null);

      try {
        const { data: productsData, error: pErr } = await supabase
          .from("products")
          .select("*")
          .order("display_order", { ascending: true })
          .order("name", { ascending: true });

        if (pErr) throw pErr;

        const mapped = (productsData ?? []).map(mapRowToProduct) as Product[];

        // pesos (tabela weight) - não pode quebrar se a tabela não existir
        const ids = mapped.map((p) => p.id).filter(Boolean);
        if (ids.length) {
          const { data: wData, error: wErr } = await supabase
            .from("weight")
            .select("product_id, weight")
            .in("product_id", ids);

          if (!wErr) {
            const byId = new Map<string, number>();
            (wData ?? []).forEach((r: any) => {
              if (r?.product_id) byId.set(String(r.product_id), safeNumber(r.weight, 0));
            });

            for (const p of mapped) {
              const w = byId.get(String(p.id));
              if (w !== undefined) (p as any).weight = w;
            }
          } else {
            if (!isMissingTableOrColumnError(wErr)) {
              console.warn("Falha ao carregar weight:", wErr);
            }
          }
        }

        if (!mounted) return;
        setItems(mapped);
      } catch (err: any) {
        console.error("Erro ao carregar produtos:", err);
        if (!mounted) return;
        setItems([]);
        setLoadError(err?.message || "Erro ao carregar produtos do banco.");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchProducts();
    return () => {
      mounted = false;
    };
  }, []);

  /* --------------------------------------------------------
     Categorias dinâmicas
  -------------------------------------------------------- */
  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    items.forEach((p) => {
      if (p.category != null) set.add(String(p.category));
    });
    return Array.from(set).sort();
  }, [items]);

  /* --------------------------------------------------------
     Ordenação / filtro
  -------------------------------------------------------- */
  const ordenados = useMemo(() => {
    return [...items].sort((a, b) => {
      const anyA: any = a;
      const anyB: any = b;

      // 1) display_order sempre manda
      const oA = getOrder(anyA);
      const oB = getOrder(anyB);
      if (oA !== oB) return oA - oB;

      // 2) categoria
      const catA = String(a.category ?? "");
      const catB = String(b.category ?? "");
      if (catA !== catB) return catA.localeCompare(catB);

      // 3) nome
      return (a.name ?? "").localeCompare(b.name ?? "");
    });
  }, [items]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    return ordenados.filter((p) => {
      const catId = String(p.category ?? "");
      const catLabel = CATEGORY_LABELS[catId] ?? catId;
      const byCat = categoria === "todas" || catId === categoria;

      if (!termo) return byCat;

      const anyP: any = p;
      const haystack = [
        p.name,
        catId,
        catLabel,
        p.description,
        p.id,
        p.old_id,
        anyP.display_order,
        anyP.price_cpf_atacado,
        anyP.price_cpf_varejo,
        anyP.price_cnpj_atacado,
        anyP.price_cnpj_varejo,
      ]
        .filter((x) => x !== null && x !== undefined && x !== "")
        .join(" ")
        .toLowerCase();

      return byCat && haystack.includes(termo);
    });
  }, [ordenados, busca, categoria]);

  /* --------------------------------------------------------
     ⭐ FIXAR NO TOPO (Categoria "todas")
     - Fixar: coloca em 0..99 (no final da lista fixada)
     - Desafixar: manda pra DEFAULT_ORDER
     - Subir/Descer: troca ordem entre fixados
  -------------------------------------------------------- */
  const pinnedSorted = useMemo(() => {
    const pins = items.filter((p) => isPinned(p as any));
    pins.sort((a, b) => getOrder(a as any) - getOrder(b as any));
    return pins;
  }, [items]);

  async function unpinAllProducts() {
    if (!pinnedSorted.length) return;

    const previous = items;
    setItems((prev) => prev.map((p) => ({ ...p, display_order: isPinned(p as any) ? DEFAULT_ORDER : getOrder(p as any) } as any)));

    const { error } = await supabase
      .from("products")
      .update({ display_order: DEFAULT_ORDER })
      .lte("display_order", PINNED_MAX);

    if (error) {
      console.error("Erro ao desafixar todos:", error);
      setItems(previous);
      setLoadError(error.message || "Erro ao limpar os fixados do topo.");
      return;
    }

    invalidateCatalogProductsCache();
  }

  async function persistDisplayOrder(productId: string, newOrder: number) {
    // otimista
    setItems((prev) =>
      prev.map((p) => (p.id === productId ? ({ ...p, display_order: newOrder } as any) : p))
    );

    const { error } = await supabase
      .from("products")
      .update({ display_order: newOrder })
      .eq("id", productId);

    if (error) {
      // rollback (recarrega, mais simples e seguro)
      console.error("Erro ao salvar display_order:", error);
      setLoadError(error.message || "Erro ao salvar a ordem do produto.");
      // refetch rápido:
      try {
        const { data, error: pErr } = await supabase
          .from("products")
          .select("*")
          .order("display_order", { ascending: true })
          .order("name", { ascending: true });
        if (!pErr) setItems((data ?? []).map(mapRowToProduct) as Product[]);
      } catch {}
      return;
    }

    invalidateCatalogProductsCache();
  }

  async function pinToTop(p: Product) {
    const alreadyPinned = isPinned(p as any);
    if (alreadyPinned) return;

    const pins = pinnedSorted;
    const next = pins.length ? Math.min(PINNED_MAX, getOrder(pins[pins.length - 1] as any) + 1) : 0;

    if (next > PINNED_MAX) {
      alert(`Você já tem muitos itens fixados (máx ${PINNED_MAX + 1}). Desafixe algum antes.`);
      return;
    }

    await persistDisplayOrder(p.id, next);
  }

  async function unpinFromTop(p: Product) {
    if (!isPinned(p as any)) return;
    await persistDisplayOrder(p.id, DEFAULT_ORDER);
  }

  async function movePinned(p: Product, dir: "up" | "down") {
    if (!isPinned(p as any)) return;

    const pins = pinnedSorted;
    const idx = pins.findIndex((x) => x.id === p.id);
    if (idx < 0) return;

    const swapWith = dir === "up" ? idx - 1 : idx + 1;
    if (swapWith < 0 || swapWith >= pins.length) return;

    const a = pins[idx];
    const b = pins[swapWith];

    const orderA = getOrder(a as any);
    const orderB = getOrder(b as any);

    // swap no banco (duas updates)
    await persistDisplayOrder(a.id, orderB);
    await persistDisplayOrder(b.id, orderA);
  }

  /* --------------------------------------------------------
     Form: Add / Edit
  -------------------------------------------------------- */
  const startAdd = () => {
    setEditing({
      id: generateId(),
      old_id: null,
      name: "",
      price: 0,
      employee_price: 0,

      images: [],
      image_path: null,
      category: "8" as any,

      // ✅ novo produto não nasce fixado
      display_order: DEFAULT_ORDER,

      description: "",
      packageInfo: "",
      weight: 0,
      weight_input: "",

      isPackage: false,
      isLaunch: false,
      featured: false,
      inStock: true,
      extraInfo: null,

      price_cpf_atacado: 0,
      price_cpf_varejo: 0,
      price_cnpj_atacado: 0,
      price_cnpj_varejo: 0,
      price_atacado: 0,
      price_varejo: 0,
      price_cpf_atacado_input: "",
      price_cpf_varejo_input: "",
      price_cnpj_atacado_input: "",
      price_cnpj_varejo_input: "",
      price_atacado_input: "",
      price_varejo_input: "",
    });
    setOpenForm(true);
  };

  const startEdit = (p: Product) => {
    const anyP: any = p;

    const wNum = safeNumber(anyP.weight, 0);

    const cpfAt = safeNumber(anyP.price_cpf_atacado, 0);
    const cpfVa = safeNumber(anyP.price_cpf_varejo, 0);
    const cnpjAt = safeNumber(anyP.price_cnpj_atacado, 0);
    const cnpjVa = safeNumber(anyP.price_cnpj_varejo, 0);
    const unifiedAt = pickUnifiedPrice(anyP.price_cpf_atacado, anyP.price_cnpj_atacado);
    const unifiedVa = pickUnifiedPrice(anyP.price_cpf_varejo, anyP.price_cnpj_varejo);

    setEditing({
      ...(p as Editable),
      old_id: safeNumberOrNull((p as any).old_id),
      images: (p.images ?? []).filter(Boolean),
      image_path: (p as any).image_path ?? (p.images?.[0] ?? null),

      display_order: getOrder(anyP),

      weight: wNum,
      weight_input: String(wNum).replace(".", ","),

      price_cpf_atacado: cpfAt,
      price_cpf_varejo: cpfVa,
      price_cnpj_atacado: cnpjAt,
      price_cnpj_varejo: cnpjVa,
      price_atacado: unifiedAt,
      price_varejo: unifiedVa,

      price_cpf_atacado_input: String(cpfAt).replace(".", ","),
      price_cpf_varejo_input: String(cpfVa).replace(".", ","),
      price_cnpj_atacado_input: String(cnpjAt).replace(".", ","),
      price_cnpj_varejo_input: String(cnpjVa).replace(".", ","),
      price_atacado_input: String(unifiedAt).replace(".", ","),
      price_varejo_input: String(unifiedVa).replace(".", ","),
    });
    setOpenForm(true);
  };

  const closeForm = () => {
    setOpenForm(false);
    setEditing(null);
    setUploadError(null);
  };

  /* --------------------------------------------------------
     Upload de imagem p/ Supabase
  -------------------------------------------------------- */
  async function uploadProductImage(file: File): Promise<string> {
    setUploadingImage(true);
    setUploadError(null);

    try {
      const productId = editing?.id ?? "unknown";
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const filePath = `${productId}/${fileName}`;

      const { data, error } = await supabase.storage.from(STORAGE_BUCKET).upload(filePath, file, {
        cacheControl: "3600",
        upsert: true,
        contentType: file.type || "image/jpeg",
      });

      if (error) throw error;

      const { data: publicData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(data.path);
      const url = publicData?.publicUrl;
      if (!url) throw new Error("Não foi possível obter a URL pública.");

      return url;
    } catch (err: any) {
      console.error("Erro ao enviar imagem:", err);
      setUploadError(err?.message || "Erro ao enviar imagem. Tente novamente.");
      throw err;
    } finally {
      setUploadingImage(false);
    }
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !editing) return;

    uploadProductImage(file)
      .then((url) => {
        setEditing((prev) =>
          prev
            ? {
                ...prev,
                images: [url, ...(prev.images ?? [])],
                image_path: prev.image_path ?? url,
              }
            : prev
        );
      })
      .catch(() => {});
  }

  function handleImageDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (!editing) return;

    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    uploadProductImage(file)
      .then((url) => {
        setEditing((prev) =>
          prev
            ? {
                ...prev,
                images: [url, ...(prev.images ?? [])],
                image_path: prev.image_path ?? url,
              }
            : prev
        );
      })
      .catch(() => {});
  }

  function handleImageDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
  }

  function setPrincipalImage(url: string) {
    if (!editing) return;
    const imgs = (editing.images ?? []).filter(Boolean);
    const next = [url, ...imgs.filter((x) => x !== url)];
    setEditing({ ...editing, images: next, image_path: url });
  }

  function removeImage(url: string) {
    if (!editing) return;
    const imgs = (editing.images ?? []).filter(Boolean).filter((x) => x !== url);
    setEditing({
      ...editing,
      images: imgs,
      image_path: (editing.image_path === url ? (imgs[0] ?? null) : editing.image_path) ?? null,
    });
  }

  /* --------------------------------------------------------
     Salvar (INSERT/UPDATE) — robusto contra "schema cache"
  -------------------------------------------------------- */
  async function writeProductsWithAutoStrip(
    existsInState: boolean,
    id: string,
    payload: Record<string, any>
  ) {
    let current = { ...payload };
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        if (existsInState) {
          const { error } = await supabase.from("products").update(current).eq("id", id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("products").insert(current);
          if (error) throw error;
        }
        return current;
      } catch (err: any) {
        const missingCol = extractMissingColumnName(err);
        if (missingCol && Object.prototype.hasOwnProperty.call(current, missingCol)) {
          const next = { ...current };
          delete (next as any)[missingCol];
          current = next;
          continue;
        }

        if (isMissingTableOrColumnError(err)) throw err;
        throw err;
      }
    }

    return current;
  }

  const onSubmitForm = async () => {
    if (!editing) return;

    if (!editing.name?.trim()) {
      alert("Informe o nome.");
      return;
    }

    setSaving(true);
    try {
      const existsInState = items.some((p) => p.id === editing.id);

      const payload = mapEditingToDbPayload(editing);
      const finalPayloadUsed = await writeProductsWithAutoStrip(existsInState, editing.id, payload);

      // weight
      const weightValue = parseBRNumber(editing.weight_input ?? (editing as any).weight, 0);
      const { error: wErr } = await supabase
        .from("weight")
        .upsert({ product_id: editing.id, weight: weightValue }, { onConflict: "product_id" });

      if (wErr && !isMissingTableOrColumnError(wErr)) {
        throw wErr;
      }

      const saved = mapPayloadBackToProduct(editing, finalPayloadUsed);

      setItems((prev) => {
        const idx = prev.findIndex((p) => p.id === saved.id);
        const next = idx >= 0 ? prev.map((p, i) => (i === idx ? saved : p)) : [saved, ...prev];
        return next;
      });
      invalidateCatalogProductsCache();

      closeForm();
    } catch (err: any) {
      console.error("Erro ao salvar produto:", err);
      alert(
        "Erro ao salvar produto no banco.\n\n" + (err?.message || err?.hint || "Erro desconhecido.")
      );
    } finally {
      setSaving(false);
    }
  };

  /* --------------------------------------------------------
     Excluir
  -------------------------------------------------------- */
  const confirmDelete = (p: Product) => setToDelete(p);

  const doDelete = async () => {
    if (!toDelete) return;

    try {
      const { error: wDelErr } = await supabase.from("weight").delete().eq("product_id", toDelete.id);
      if (wDelErr && !isMissingTableOrColumnError(wDelErr)) throw wDelErr;

      const { error } = await supabase.from("products").delete().eq("id", toDelete.id);
      if (error) throw error;

      setItems((prev) => prev.filter((p) => p.id !== toDelete.id));
      invalidateCatalogProductsCache();
      setToDelete(null);
    } catch (err) {
      console.error("Erro ao excluir produto:", err);
      alert("Erro ao excluir produto no banco.");
    }
  };

  /* --------------------------------------------------------
     UI helpers
  -------------------------------------------------------- */
  const curPath = location?.pathname ?? "";

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
  }> = ({ label, icon, onClick, active = false }) => (
    <button onClick={onClick} type="button" className={selectableBtn(active)}>
      <span className="shrink-0">{icon}</span>
      <span className="text-[12.5px] line-clamp-1">{label}</span>
    </button>
  );

  // só habilita “fixar no topo” quando está em "todas"
  const canPinHere = categoria === "todas";

  const pinnedCount = pinnedSorted.length;

  return (
    <div className="min-h-screen bg-[#f6f7f9]">
      {/* TOP BAR */}
      <div className="sticky top-0 z-40 bg-[#f6f7f9] px-4 sm:px-5 pt-4 sm:pt-5 pb-3 sm:pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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
            <Shield className="h-4 w-4" />
            <span className="font-extrabold text-[13px]">Admin • Produtos</span>
          </div>

          <button
            onClick={startAdd}
            type="button"
            className="
              h-11 px-4 rounded-2xl bg-black text-white font-extrabold
              hover:bg-black/90 active:scale-[0.99]
              flex items-center gap-2
              justify-center
            "
          >
            <Plus className="h-4 w-4" />
            Novo
          </button>
        </div>
      </div>

      {/* BUSCA */}
      <div className="sticky top-[132px] sm:top-[88px] z-40 bg-[#f6f7f9] px-4 sm:px-5 pb-4">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-3">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, categoria, ID..."
              className="h-12 pl-12 pr-12 rounded-2xl bg-white border border-gray-200 shadow-sm text-[15px]"
              inputMode="search"
            />
            <button
              type="button"
              onClick={() => setBusca("")}
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

          <Select value={categoria} onValueChange={setCategoria}>
            <SelectTrigger className="h-12 rounded-2xl bg-white border border-gray-200 shadow-sm">
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as categorias</SelectItem>
              {categoryOptions.map((id) => (
                <SelectItem key={id} value={id}>
                  {CATEGORY_LABELS[id] ?? id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <main className="px-4 sm:px-5 pb-28">
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6 items-start">
          {/* SIDEBAR */}
          <aside className="self-start lg:sticky lg:top-[148px]">
            <div className="rounded-[26px] border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <div className="text-[14px] font-extrabold text-gray-900">Admin</div>
                <div className="text-[11px] text-gray-500 mt-1">Acesso rápido</div>
              </div>

              <div className="p-3 flex flex-col gap-2">
                <SidebarLink
                  label="Catálogo"
                  icon={<ArrowLeft className="h-4 w-4" />}
                  onClick={() => navigate(ROUTES.catalog)}
                  active={isActiveRoute(curPath, ROUTES.catalog)}
                />
                <SidebarLink
                  label="Destaques"
                  icon={<Star className="h-4 w-4" />}
                  onClick={() => navigate(ROUTES.featured)}
                  active={isActiveRoute(curPath, ROUTES.featured)}
                />
                <SidebarLink
                  label="Avisos"
                  icon={<Boxes className="h-4 w-4" />}
                  onClick={() => navigate(ROUTES.notices)}
                  active={isActiveRoute(curPath, ROUTES.notices)}
                />
              </div>
            </div>

            <div className="mt-4 rounded-[26px] border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <div className="text-[14px] font-extrabold text-gray-900">Resumo</div>
                <div className="text-[11px] text-gray-500 mt-1">Status do filtro</div>
              </div>

              <div className="p-3 space-y-2">
                <div className="rounded-2xl border border-gray-200 bg-white p-3">
                  <div className="text-[11px] text-gray-500 font-semibold">Produtos</div>
                  <div className="text-[18px] font-extrabold text-gray-900">
                    {loading ? "—" : filtrados.length}
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-3">
                  <div className="text-[11px] text-gray-500 font-semibold">Categoria</div>
                  <div className="text-[13px] font-extrabold text-gray-900 line-clamp-1">
                    {categoria === "todas" ? "Todas" : CATEGORY_LABELS[categoria] ?? categoria}
                  </div>
                </div>

                {/* ✅ Card didático: topo */}
                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
                  <div className="text-[11px] text-gray-500 font-semibold">Topo do catálogo</div>
                  <div className="text-[12px] text-gray-700 font-semibold mt-1">
                    {canPinHere ? (
                      <>
                        Use <b>Fixar no topo</b> nos cards para escolher os produtos que ficam
                        primeiro. <br />
                        Fixados agora: <b>{pinnedCount}</b>
                      </>
                    ) : (
                      <>
                        Para escolher o topo, selecione <b>“Todas as categorias”</b>.
                      </>
                    )}
                  </div>

                  {canPinHere && pinnedCount > 0 && (
                    <button
                      type="button"
                      onClick={unpinAllProducts}
                      className="mt-3 w-full h-10 rounded-2xl border border-red-200 bg-red-50 text-red-700 font-extrabold hover:bg-red-100 active:scale-[0.99]"
                    >
                      Desafixar todos
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={startAdd}
                  className="
                    w-full h-11 rounded-2xl bg-black text-white font-extrabold
                    hover:bg-black/90 active:scale-[0.99]
                    flex items-center justify-center gap-2
                  "
                >
                  <Plus className="h-4 w-4" />
                  Novo produto
                </button>
              </div>
            </div>
          </aside>

          {/* CONTENT */}
          <section className="min-w-0">
            <div className="rounded-[28px] border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="p-4 border-b border-gray-100 flex items-end justify-between gap-3">
                <div>
                  <div className="text-[16px] font-extrabold text-gray-900">Produtos</div>
                  <div className="text-[12px] text-gray-500 mt-1">
                    {canPinHere
                      ? "Categoria: Todas • Use “Fixar no topo” para escolher os primeiros itens"
                      : "Toque em “Editar” para ajustar o produto"}
                  </div>
                </div>

                {!loading && (
                  <div className="text-[12px] text-gray-500 font-semibold">
                    {filtrados.length} itens
                  </div>
                )}
              </div>

              <div className="p-4 pb-10">
                {loadError && (
                  <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700 font-semibold">
                    Erro: {loadError}
                  </div>
                )}

                {loading ? (
                  <div className="rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-600 inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Carregando produtos...
                  </div>
                ) : filtrados.length === 0 ? (
                  <div className="text-gray-500 font-semibold">Nenhum produto encontrado.</div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                    {filtrados.map((p) => {
                      const anyP: any = p;
                      const catId = String(p.category ?? "");
                      const catLabel = CATEGORY_LABELS[catId] || catId || "Sem categoria";

                      const thumb =
                        (p.images?.length ? p.images[0] : null) ||
                        (p as any).image_path ||
                        FALLBACK_IMG;

                      const w = safeNumber((p as any).weight, 0);
                      const displayPrice = getDisplayPrice(anyP);

                      const order = getOrder(anyP);
                      const pinned = isPinned(anyP);

                      // controls topo só quando categoria=todas
                      const showTopControls = canPinHere;

                      return (
                        <div
                          key={p.id}
                          className="rounded-[28px] border border-gray-200 bg-white shadow-sm overflow-hidden"
                        >
                          <div className="h-[170px] bg-gray-100 overflow-hidden">
                            <img
                              src={thumb}
                              alt={p.name}
                              className="h-full w-full object-cover"
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).src = FALLBACK_IMG;
                              }}
                            />
                          </div>

                          <div className="p-4">
                            <div className="text-[16px] font-extrabold text-gray-900 line-clamp-2">
                              {p.name}
                            </div>

                            <div className="mt-2 flex flex-wrap gap-2 text-[12px] font-semibold">
                              <Badge variant="secondary">{catLabel || "Sem categoria"}</Badge>
                              {pinned && <Badge>📌 Topo</Badge>}
                              {p.isPackage && (
                                <Badge className="gap-1">
                                  <Package className="h-3 w-3" />
                                  Pacote
                                </Badge>
                              )}
                              {p.featured && <Badge>⭐ Destaque</Badge>}
                              {p.isLaunch && <Badge variant="outline">Lançamento</Badge>}
                              {p.inStock === false && (
                                <Badge variant="destructive">Sem estoque</Badge>
                              )}
                            </div>

                            <div className="mt-3 text-[18px] font-extrabold text-gray-900">
                              {formatMoneyBR(displayPrice)}{" "}
                              <span className="text-[12px] text-gray-500 font-semibold">
                                (CPF Varejo)
                              </span>
                            </div>

                            <div className="mt-1 text-[12px] text-gray-500 font-semibold">
                              ID: {p.old_id !== null ? p.old_id : p.id}
                              {p.packageInfo ? ` • ${p.packageInfo}` : ""}
                              {w ? ` • ${w}kg` : ""}
                              {showTopControls ? ` • ordem: ${order}` : ""}
                            </div>

                            <div className="mt-2 text-[12px] font-semibold text-gray-700">
                              Posição no catálogo:{" "}
                              <span className="font-extrabold text-gray-900">
                                {getCatalogPositionLabel(anyP)}
                              </span>
                            </div>

                            {/* ✅ TOP CONTROLS DIDÁTICOS */}
                            {showTopControls && (
                              <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 p-3">
                                {!pinned ? (
                                  <button
                                    type="button"
                                    onClick={() => pinToTop(p)}
                                    className="
                                      w-full h-11 rounded-2xl bg-black text-white font-extrabold
                                      hover:bg-black/90 active:scale-[0.99]
                                      flex items-center justify-center gap-2
                                    "
                                    title="Este produto vai aparecer no topo do catálogo (categoria Todas)"
                                  >
                                    <Pin className="h-4 w-4" />
                                    Fixar no topo
                                  </button>
                                ) : (
                                  <div className="grid grid-cols-3 gap-2">
                                    <button
                                      type="button"
                                      onClick={() => movePinned(p, "up")}
                                      className="
                                        h-11 rounded-2xl border border-gray-200 bg-white
                                        hover:bg-gray-50 font-extrabold active:scale-[0.99]
                                        flex items-center justify-center gap-1
                                      "
                                      title="Subir no topo"
                                    >
                                      <ChevronUp className="h-4 w-4" />
                                      Subir
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => movePinned(p, "down")}
                                      className="
                                        h-11 rounded-2xl border border-gray-200 bg-white
                                        hover:bg-gray-50 font-extrabold active:scale-[0.99]
                                        flex items-center justify-center gap-1
                                      "
                                      title="Descer no topo"
                                    >
                                      <ChevronDown className="h-4 w-4" />
                                      Descer
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => unpinFromTop(p)}
                                      className="
                                        h-11 rounded-2xl border border-red-200 bg-red-50 text-red-700
                                        hover:bg-red-100 font-extrabold active:scale-[0.99]
                                        flex items-center justify-center gap-1
                                      "
                                      title="Tirar do topo"
                                    >
                                      <PinOff className="h-4 w-4" />
                                      Desafixar
                                    </button>
                                  </div>
                                )}

                                <div className="mt-2 text-[11px] text-gray-600 font-semibold">
                                  {pinned
                                    ? "Este produto está fixado. Use Subir/Descer para ordenar os fixados."
                                    : "Fixando, ele vira um dos primeiros itens do catálogo na categoria “Todas”."}
                                </div>
                              </div>
                            )}

                            <div className="mt-4 grid grid-cols-2 gap-3">
                              <button
                                className="
                                  h-11 rounded-2xl border border-gray-200 bg-white
                                  hover:bg-gray-50 font-extrabold active:scale-[0.99]
                                "
                                onClick={() => startEdit(p)}
                                type="button"
                              >
                                Editar
                              </button>

                              <button
                                className="
                                  h-11 rounded-2xl border border-red-200 bg-red-50 text-red-700
                                  hover:bg-red-100 font-extrabold active:scale-[0.99]
                                "
                                onClick={() => confirmDelete(p)}
                                type="button"
                              >
                                Excluir
                              </button>
                            </div>
                          </div>
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

      {/* ---------------- Form Modal ---------------- */}
      <Dialog open={openForm} onOpenChange={(o) => (o ? setOpenForm(true) : closeForm())}>
        <DialogContent className="sm:max-w-[1040px] rounded-[28px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[18px] font-extrabold">
              {editing && items.some((p) => p.id === editing.id) ? "Editar produto" : "Novo produto"}
            </DialogTitle>
          </DialogHeader>

          {editing && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Preview / resumo */}
              <div className="lg:col-span-2 rounded-[24px] border border-gray-200 bg-gray-50 p-3 flex items-center gap-3">
                <img
                  src={(editing.images && editing.images[0]) || editing.image_path || FALLBACK_IMG}
                  alt={editing.name}
                  className="h-16 w-16 rounded-2xl object-cover border border-gray-200 bg-white"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src = FALLBACK_IMG;
                  }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-extrabold text-gray-900 line-clamp-1">
                    {editing.name || "Produto sem nome"}
                  </div>
                  <div className="text-[12px] text-gray-600 font-semibold">
                    ID: {editing.old_id !== null ? editing.old_id : editing.id}
                  </div>
                </div>

                <div className="hidden sm:flex items-center gap-2">
                  <div className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-3 h-10 text-[12px] font-extrabold">
                    <ImageIcon className="h-4 w-4" />
                    {(editing.images?.length ?? 0)} imagens
                  </div>
                </div>
              </div>

              {/* Coluna esquerda */}
              <div className="space-y-3">
                <Field label="ID (old_id)">
                  <Input
                    className="h-12 rounded-2xl"
                    value={editing.old_id !== null ? String(editing.old_id) : ""}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const n = raw === "" ? null : safeNumberOrNull(raw);
                      setEditing({ ...editing, old_id: n });
                    }}
                    placeholder="ID numérico do produto"
                    inputMode="numeric"
                  />
                </Field>

                <Field label="Nome">
                  <Input
                    className="h-12 rounded-2xl"
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    placeholder="Nome do produto"
                  />
                </Field>

                <Field label="Categoria">
                  <Select
                    value={String(editing.category ?? "8")}
                    onValueChange={(v) => setEditing({ ...editing, category: v as any })}
                  >
                    <SelectTrigger className="h-12 rounded-2xl">
                      <SelectValue placeholder="Categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(CATEGORY_LABELS).map(([id, label]) => (
                        <SelectItem key={id} value={id}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                {/* 2 preços */}
                <div className="rounded-[24px] border border-gray-200 bg-white p-3">
                  <div className="text-[13px] font-extrabold text-gray-900">Preços por tabela</div>
                  <div className="text-[11px] text-gray-500 font-semibold mt-1">
                    Defina só atacado e varejo. O mesmo valor será salvo para CPF e CNPJ.
                  </div>

                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Atacado (R$)">
                      <Input
                        className="h-12 rounded-2xl"
                        type="text"
                        inputMode="decimal"
                        value={editing.price_atacado_input ?? ""}
                        onChange={(e) =>
                          setEditing({ ...editing, price_atacado_input: e.target.value })
                        }
                        placeholder="Ex.: 48,50"
                      />
                    </Field>

                    <Field label="Varejo (R$)">
                      <Input
                        className="h-12 rounded-2xl"
                        type="text"
                        inputMode="decimal"
                        value={editing.price_varejo_input ?? ""}
                        onChange={(e) =>
                          setEditing({ ...editing, price_varejo_input: e.target.value })
                        }
                        placeholder="Ex.: 52,90"
                      />
                    </Field>
                  </div>
                </div>

                {editing && (
                  <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 p-3">
                    <div className="text-[13px] font-extrabold text-emerald-950">
                      Como o preço é exibido no catálogo
                    </div>
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px] font-semibold text-emerald-950">
                      <div className="rounded-2xl bg-white/70 border border-emerald-100 p-3">
                        <div className="text-[11px] text-emerald-700">Atacado</div>
                        <div className="mt-1">{formatMoneyBR(parseBRNumber(editing.price_atacado_input ?? editing.price_atacado, 0))}/kg</div>
                        <div className="text-emerald-700 mt-1">
                          Peso: {parseBRNumber(editing.weight_input ?? editing.weight, 0).toLocaleString("pt-BR")}kg
                        </div>
                        <div className="mt-1 font-extrabold">
                          Final: {formatMoneyBR(parseBRNumber(editing.price_atacado_input ?? editing.price_atacado, 0) * parseBRNumber(editing.weight_input ?? editing.weight, 0))}
                        </div>
                      </div>

                      <div className="rounded-2xl bg-white/70 border border-emerald-100 p-3">
                        <div className="text-[11px] text-emerald-700">Varejo</div>
                        <div className="mt-1">{formatMoneyBR(parseBRNumber(editing.price_varejo_input ?? editing.price_varejo, 0))}/kg</div>
                        <div className="text-emerald-700 mt-1">
                          Peso: {parseBRNumber(editing.weight_input ?? editing.weight, 0).toLocaleString("pt-BR")}kg
                        </div>
                        <div className="mt-1 font-extrabold">
                          Final: {formatMoneyBR(parseBRNumber(editing.price_varejo_input ?? editing.price_varejo, 0) * parseBRNumber(editing.weight_input ?? editing.weight, 0))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Package info">
                    <Input
                      className="h-12 rounded-2xl"
                      value={editing.packageInfo ?? ""}
                      onChange={(e) => setEditing({ ...editing, packageInfo: e.target.value })}
                      placeholder="Ex.: Pacote 1kg"
                    />
                  </Field>

                  <Field label="Peso (kg) • tabela weight">
                    <Input
                      className="h-12 rounded-2xl"
                      type="text"
                      inputMode="decimal"
                      value={editing.weight_input ?? ""}
                      onChange={(e) => setEditing({ ...editing, weight_input: e.target.value })}
                      placeholder="Ex.: 3,5"
                    />
                  </Field>
                </div>

                <Field label="Descrição">
                  <Textarea
                    value={editing.description ?? ""}
                    onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                    rows={4}
                    className="rounded-2xl"
                  />
                </Field>
              </div>

              {/* Coluna direita */}
              <div className="space-y-3">
                <Field label="Imagens do produto">
                  <div className="space-y-2">
                    <div
                      onDrop={handleImageDrop}
                      onDragOver={handleImageDragOver}
                      className="
                        rounded-[24px] border border-dashed border-gray-300
                        bg-white p-4 text-center cursor-pointer
                        hover:bg-gray-50 transition
                      "
                      onClick={() => {
                        const input = document.getElementById(
                          "product-image-input"
                        ) as HTMLInputElement | null;
                        input?.click();
                      }}
                    >
                      <input
                        id="product-image-input"
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleFileInputChange}
                      />

                      <div className="flex items-center justify-center gap-2 text-gray-900 font-extrabold">
                        <ImageIcon className="h-5 w-5" />
                        Arraste uma imagem aqui ou clique para selecionar
                      </div>
                      <div className="text-[12px] text-gray-500 font-semibold mt-1">
                        Toque numa miniatura para definir como principal.
                      </div>

                      {uploadingImage && (
                        <div className="mt-2 text-[12px] text-blue-600 font-semibold inline-flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Enviando imagem...
                        </div>
                      )}

                      {uploadError && (
                        <div className="mt-2 text-[12px] text-red-600 font-semibold">
                          {uploadError}
                        </div>
                      )}
                    </div>

                    {editing.images && editing.images.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {editing.images.map((img, index) => (
                          <div
                            key={img + index}
                            className="relative w-20 h-20 rounded-2xl overflow-hidden border border-gray-200 bg-gray-50"
                            title={index === 0 ? "Principal" : "Imagem"}
                          >
                            <button
                              type="button"
                              className="absolute inset-0"
                              onClick={() => setPrincipalImage(img)}
                              aria-label="Definir como principal"
                            />
                            <img
                              src={img}
                              alt={`Imagem ${index + 1}`}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).src = FALLBACK_IMG;
                              }}
                            />

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeImage(img);
                              }}
                              className="absolute top-1 right-1 h-7 w-7 rounded-2xl bg-white/90 border border-gray-200 flex items-center justify-center hover:bg-white"
                              aria-label="Remover imagem"
                              title="Remover"
                            >
                              <Trash2 className="h-3.5 w-3.5 text-gray-700" />
                            </button>

                            {index === 0 && (
                              <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-[10px] text-white text-center font-extrabold">
                                Principal
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </Field>

                <div className="rounded-[24px] border border-gray-200 bg-white p-3">
                  <div className="text-[13px] font-extrabold text-gray-900">Atributos</div>
                  <div className="text-[11px] text-gray-500 font-semibold mt-1">
                    Essas flags ajudam no catálogo
                  </div>

                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Flag
                      label="Pacote"
                      checked={!!editing.isPackage}
                      onCheckedChange={(v) => setEditing({ ...editing, isPackage: v })}
                    />
                    <Flag
                      label="Destaque"
                      checked={!!editing.featured}
                      onCheckedChange={(v) => setEditing({ ...editing, featured: v })}
                    />
                    <Flag
                      label="Em estoque"
                      checked={editing.inStock !== false}
                      onCheckedChange={(v) => setEditing({ ...editing, inStock: v })}
                    />
                    <Flag
                      label="Lançamento"
                      checked={!!editing.isLaunch}
                      onCheckedChange={(v) => setEditing({ ...editing, isLaunch: v })}
                    />
                  </div>
                </div>

                <div className="rounded-[24px] border border-gray-200 bg-gray-50 p-3">
                  <div className="text-[11px] text-gray-500 font-semibold">Observação</div>
                  <div className="text-[12px] text-gray-700 font-semibold mt-1">
                    O topo do catálogo é controlado por <b>products.display_order</b>. <br />
                    Fixados ficam em <b>0..99</b>. O resto fica em <b>{DEFAULT_ORDER}+</b>.
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              onClick={closeForm}
              disabled={saving}
              className="h-11 rounded-2xl font-extrabold"
            >
              Cancelar
            </Button>
            <Button
              onClick={onSubmitForm}
              disabled={saving}
              className="h-11 rounded-2xl font-extrabold"
            >
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent className="rounded-[28px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-extrabold">Excluir produto?</AlertDialogTitle>
          </AlertDialogHeader>

          <div className="text-sm text-muted-foreground">
            <b>{toDelete?.name}</b> (ID: {toDelete?.old_id ?? toDelete?.id})
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setToDelete(null)} className="rounded-2xl">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-2xl"
              onClick={doDelete}
            >
              Confirmar exclusão
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* --------------------------------------------------------
   SMALL UI COMPONENTS
-------------------------------------------------------- */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[12px] font-extrabold text-gray-900">{label}</label>
      {children}
    </div>
  );
}

function Flag({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-3 h-12">
      <span className="text-[13px] font-extrabold text-gray-900">{label}</span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </label>
  );
}
