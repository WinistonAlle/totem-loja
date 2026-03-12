// src/pages/Avisos.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  ArrowLeft,
  X,
  UploadCloud,
  Trash2,
  Image as ImageIcon,
  Bell,
} from "lucide-react";

import logoGostinho from "@/images/logoc.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/sonner";

/* --------------------------------------------------------
   ROUTES
-------------------------------------------------------- */
const ROUTES = {
  catalog: "/catalogo",
};

/* --------------------------------------------------------
   HELPERS
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

function isMissingRelation(err: any) {
  const msg = String(err?.message ?? "");
  return (
    err?.code === "42P01" ||
    msg.toLowerCase().includes("does not exist") ||
    msg.toLowerCase().includes("relation")
  );
}

function isRlsViolation(err: any) {
  const msg = String(err?.message ?? "").toLowerCase();
  return msg.includes("row-level security") || msg.includes("rls") || err?.code === "42501";
}

function slugFileName(name: string) {
  return (name || "imagem")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

async function uploadNoticeImage(file: File) {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const base = slugFileName(file.name.replace(/\.[^/.]+$/, ""));
  const path = `notices/${Date.now()}-${Math.random().toString(16).slice(2)}-${base}.${ext}`;

  const { error: upErr } = await supabase.storage.from("notices").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || undefined,
  });

  if (upErr) throw upErr;

  const { data } = supabase.storage.from("notices").getPublicUrl(path);
  return data.publicUrl as string;
}

function extractStoragePathFromPublicUrl(publicUrl: string) {
  // Esperado: .../storage/v1/object/public/notices/<PATH>
  const marker = "/storage/v1/object/public/notices/";
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return null;
  return publicUrl.slice(idx + marker.length);
}

function formatDateBR(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* --------------------------------------------------------
   TYPES
-------------------------------------------------------- */
interface Notice {
  id: string;
  title: string;
  body: string;
  image_url?: string | null;
  created_at?: string;
  is_published?: boolean;
}

/* --------------------------------------------------------
   PAGE
-------------------------------------------------------- */
const Avisos: React.FC = () => {
  const navigate = useNavigate();

  const session: any = useMemo(() => safeGetCustomer(), []);
  const isAdmin = useMemo(() => String(session?.role ?? "").toLowerCase() === "admin", [session]);

  const [notices, setNotices] = useState<Notice[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // composer
  const [composerOpen, setComposerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [formTitle, setFormTitle] = useState("");
  const [formBody, setFormBody] = useState("");
  const [formPublish, setFormPublish] = useState(true);

  // imagem (somente upload)
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [formImageFile, setFormImageFile] = useState<File | null>(null);
  const [formImagePreview, setFormImagePreview] = useState<string | null>(null);

  // delete
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const resetForm = () => {
    setFormTitle("");
    setFormBody("");
    setFormPublish(true);
    setFormImageFile(null);
    setFormImagePreview(null);
    setDragOver(false);
  };

  const fetchNotices = async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from("notices")
        .select("id, title, body, image_url, created_at, is_published")
        .eq("is_published", true)
        .order("created_at", { ascending: false });

      if (error) {
        if (isMissingRelation(error)) {
          setNotices([]);
          setLoadError('Tabela "notices" ainda não existe nesse banco (ou está sem acesso).');
          return;
        }
        setNotices([]);
        setLoadError(error.message);
        return;
      }

      const rows = ((data as any[]) ?? []) as Notice[];
      setNotices(rows);
      setLoadError(null);
      setCurrentIndex(0);
    } catch (err: any) {
      setLoadError(String(err?.message ?? err));
      setNotices([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotices();
  }, []);

  // auto-rotate (kiosk friendly)
  useEffect(() => {
    if (notices.length <= 1) return;
    const id = setInterval(() => {
      setCurrentIndex((p) => (p + 1) % notices.length);
    }, 8000);
    return () => clearInterval(id);
  }, [notices]);

  const current = notices.length ? notices[currentIndex] : null;

  const goPrev = () => {
    if (notices.length <= 1) return;
    setCurrentIndex((p) => (p - 1 + notices.length) % notices.length);
  };

  const goNext = () => {
    if (notices.length <= 1) return;
    setCurrentIndex((p) => (p + 1) % notices.length);
  };

  const setPickedFile = (file: File | null) => {
    setFormImageFile(file);
    setFormImagePreview(null);

    if (!file) return;
    const url = URL.createObjectURL(file);
    setFormImagePreview(url);
  };

  const onDropFiles = (files: FileList | null) => {
    if (!files || !files.length) return;
    const file = files[0];
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione um arquivo de imagem.");
      return;
    }
    setPickedFile(file);
  };

  const handleCreateNotice = async () => {
    if (!isAdmin) return;

    const title = formTitle.trim();
    const body = formBody.trim();

    if (!title || !body) {
      toast.error("Preencha título e descrição.");
      return;
    }

    try {
      setSaving(true);

      let imageUrl: string | null = null;

      if (formImageFile) {
        toast.message("Enviando imagem...");
        try {
          imageUrl = await uploadNoticeImage(formImageFile);
        } catch (e: any) {
          toast.error(`Falha ao enviar imagem: ${String(e?.message ?? e)}`);
          return;
        }
      }

      const payload: any = {
        title,
        body,
        image_url: imageUrl,
        is_published: !!formPublish,
      };

      const { error } = await supabase.from("notices").insert(payload);

      if (error) {
        if (isRlsViolation(error)) {
          toast.error('RLS bloqueou o INSERT em "notices". Verifique a policy de insert.');
          return;
        }
        toast.error(`Não foi possível salvar: ${error.message}`);
        return;
      }

      toast.success("Aviso criado!");
      resetForm();
      setComposerOpen(false);

      await fetchNotices();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err: any) {
      toast.error(String(err?.message ?? err));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteNotice = async (notice: Notice) => {
    if (!isAdmin) return;

    const ok = window.confirm(
      `Excluir este aviso?\n\n"${notice.title}"\n\nEssa ação não pode ser desfeita.`
    );
    if (!ok) return;

    try {
      setDeletingId(notice.id);

      // 1) tenta remover imagem do storage (best-effort)
      const url = String(notice.image_url ?? "");
      const storagePath = url ? extractStoragePathFromPublicUrl(url) : null;

      if (storagePath) {
        const { error: rmErr } = await supabase.storage.from("notices").remove([storagePath]);
        if (rmErr) {
          toast.message("Aviso: não consegui remover a imagem do Storage (seguindo com a exclusão).");
        }
      }

      // 2) remove o registro
      const { error } = await supabase.from("notices").delete().eq("id", notice.id);

      if (error) {
        if (isRlsViolation(error)) {
          toast.error('RLS bloqueou o DELETE em "notices". Verifique a policy de delete.');
          return;
        }
        toast.error(`Erro ao excluir: ${error.message}`);
        return;
      }

      toast.success("Aviso excluído!");
      await fetchNotices();
    } catch (e: any) {
      toast.error(String(e?.message ?? e));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#f6f7f9]">
      {/* HERO (igual vibe do Index: full width, encosta no topo) */}
      <section className="w-full">
        <div className="h-[384px] w-full bg-gray-100 overflow-hidden relative">
          {current?.image_url ? (
            <img
              src={current.image_url}
              alt={current.title || "Aviso"}
              className="h-full w-full object-cover"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <div className="h-full w-full grid place-items-center text-gray-400 font-semibold">
              <img src={logoGostinho} alt="GM" className="h-16 opacity-80" />
            </div>
          )}

          {/* overlay + conteúdo */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

          <div className="absolute left-5 right-5 bottom-5 text-white">
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="h-10 w-10 rounded-2xl bg-white/15 border border-white/20 backdrop-blur grid place-items-center">
                    <Bell className="h-5 w-5" />
                  </div>
                  <div className="text-[11px] font-extrabold tracking-[0.2em] opacity-95 uppercase">
                    Avisos e promoções
                  </div>
                </div>

                <div className="mt-2 text-[28px] md:text-[32px] font-extrabold leading-tight line-clamp-1">
                  {current?.title || (loading ? "Carregando avisos..." : "Avisos da loja")}
                </div>

                <div className="mt-2 text-[14px] md:text-[15px] opacity-95 line-clamp-2 whitespace-pre-line">
                  {current?.body ||
                    (loading ? "Aguarde um instante..." : "Comunicados e promoções vão aparecer aqui.")}
                </div>

                <div className="mt-3 text-[12px] opacity-85 font-semibold">
                  {current?.created_at ? <>Publicado em {formatDateBR(current.created_at)}</> : <>&nbsp;</>}
                </div>
              </div>

              {/* ações (admin) */}
              <div className="flex items-center gap-2 shrink-0">
                {isAdmin && current?.id && (
                  <button
                    type="button"
                    onClick={() => handleDeleteNotice(current)}
                    className="
                      h-12 w-12 rounded-2xl bg-white/20 backdrop-blur
                      border border-white/25 hover:bg-white/25
                      active:scale-[0.99]
                    "
                    disabled={!!deletingId}
                    title="Excluir aviso"
                    aria-label="Excluir aviso"
                  >
                    <Trash2 className="h-5 w-5 mx-auto text-white" />
                  </button>
                )}
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="text-[12px] opacity-90 font-semibold">
                {notices.length > 0 ? (
                  <>
                    {currentIndex + 1} de {notices.length}
                  </>
                ) : (
                  <>—</>
                )}
              </div>

              {notices.length > 1 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={goPrev}
                    className="
                      h-12 w-12 rounded-2xl bg-white/20 backdrop-blur
                      border border-white/25 hover:bg-white/25
                      active:scale-[0.99]
                    "
                    aria-label="Aviso anterior"
                    type="button"
                  >
                    <ChevronLeft className="h-6 w-6 mx-auto text-white" />
                  </button>

                  <button
                    onClick={goNext}
                    className="
                      h-12 w-12 rounded-2xl bg-white/20 backdrop-blur
                      border border-white/25 hover:bg-white/25
                      active:scale-[0.99]
                    "
                    aria-label="Próximo aviso"
                    type="button"
                  >
                    <ChevronRight className="h-6 w-6 mx-auto text-white" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* TOP BAR (proporção do Index) */}
      <div className="sticky top-0 z-40 bg-[#f6f7f9] px-5 pt-5 pb-5">
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => navigate(ROUTES.catalog)}
            type="button"
            className="
              h-12 px-5 rounded-2xl bg-white border border-gray-200
              shadow-[0_10px_24px_rgba(0,0,0,0.06)]
              font-extrabold text-[14px]
              hover:bg-gray-50 active:scale-[0.99]
              flex items-center gap-2
            "
          >
            <ArrowLeft className="h-5 w-5" />
            Voltar ao catálogo
          </button>

          {isAdmin && (
            <Button
              onClick={() => {
                setComposerOpen((v) => !v);
                if (!composerOpen) setTimeout(() => window.scrollTo({ top: 384, behavior: "smooth" }), 80);
              }}
              className="h-12 rounded-2xl bg-black text-white font-extrabold px-5"
              disabled={saving}
            >
              {composerOpen ? (
                <>
                  <X className="h-5 w-5 mr-2" />
                  Fechar
                </>
              ) : (
                <>
                  <Plus className="h-5 w-5 mr-2" />
                  Novo aviso
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      <main className="px-5 pb-10">
        {loadError && (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700 font-semibold">
            Erro: {loadError}
          </div>
        )}

        {/* GRID tipo Index: sidebar + conteúdo */}
        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6 items-start">
          {/* LEFT: SIDEBAR */}
          <aside className="self-start lg:sticky lg:top-[112px] lg:h-[calc(100dvh-128px)]">
            <div className="rounded-[26px] border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col">
              {/* topo sidebar */}
              <div className="p-4 border-b border-gray-100">
                <div className="text-[18px] font-extrabold text-gray-900">Todos os avisos</div>
                <div className="text-[12px] text-gray-500 mt-1 font-semibold">
                  Toque em um aviso para exibir no banner.
                </div>

                {!loading && (
                  <div className="mt-3 inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2">
                    <span className="text-[12px] font-extrabold text-gray-900">{notices.length}</span>
                    <span className="text-[12px] font-semibold text-gray-600">itens</span>
                  </div>
                )}
              </div>

              {/* composer (admin) dentro da sidebar */}
              {isAdmin && composerOpen && (
                <div className="p-4 border-b border-gray-100">
                  <div className="rounded-[22px] border border-gray-200 bg-gray-50 overflow-hidden">
                    <div className="p-3 border-b border-gray-200 bg-white flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[13px] font-extrabold text-gray-900">Criar novo aviso</div>
                        <div className="text-[11px] text-gray-500 font-semibold mt-1 line-clamp-1">
                          Arraste uma imagem ou clique para selecionar.
                        </div>
                      </div>

                      <div className="text-[11px] text-gray-500 font-semibold shrink-0">
                        {formPublish ? "Publica" : "Rascunho"}
                      </div>
                    </div>

                    {/* corpo com scroll em telas menores */}
                    <div className="p-3 space-y-3 max-h-[65vh] lg:max-h-none overflow-auto">
                      <div className="space-y-1">
                        <div className="text-[12px] font-extrabold text-gray-700">Título</div>
                        <Input
                          value={formTitle}
                          onChange={(e) => setFormTitle(e.target.value)}
                          placeholder="Ex: Promoção de sexta!"
                          className="h-11 rounded-2xl bg-white"
                          maxLength={120}
                          disabled={saving}
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="text-[12px] font-extrabold text-gray-700">Descrição</div>
                        <Textarea
                          value={formBody}
                          onChange={(e) => setFormBody(e.target.value)}
                          placeholder="Escreva o aviso..."
                          className="min-h-[120px] rounded-2xl bg-white"
                          maxLength={700}
                          disabled={saving}
                        />
                        <div className="text-[11px] text-gray-400 font-semibold">{formBody.length}/700</div>
                      </div>

                      {/* imagem */}
                      <div className="rounded-[20px] border border-gray-200 bg-white overflow-hidden">
                        <div className="p-3 border-b border-gray-100">
                          <div className="text-[12px] font-extrabold text-gray-800">Imagem (opcional)</div>
                          <div className="text-[11px] text-gray-500 font-semibold mt-1">
                            Recomendado: 1200×600 (ou similar).
                          </div>
                        </div>

                        <div className="p-3 space-y-3">
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => onDropFiles(e.target.files)}
                            disabled={saving}
                          />

                          <button
                            type="button"
                            onDragEnter={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setDragOver(true);
                            }}
                            onDragOver={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setDragOver(true);
                            }}
                            onDragLeave={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setDragOver(false);
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setDragOver(false);
                              onDropFiles(e.dataTransfer.files);
                            }}
                            onClick={() => fileInputRef.current?.click()}
                            className={`
                              w-full rounded-2xl border p-4 text-left transition-all active:scale-[0.99]
                              ${dragOver ? "border-black bg-gray-100" : "border-gray-200 bg-white hover:bg-gray-50"}
                            `}
                            disabled={saving}
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className={`
                                  h-10 w-10 rounded-2xl border flex items-center justify-center
                                  ${dragOver ? "border-black bg-black text-white" : "border-gray-200 bg-white text-gray-800"}
                                `}
                              >
                                <UploadCloud className="h-5 w-5" />
                              </div>

                              <div className="min-w-0">
                                <div className="text-[13px] font-extrabold text-gray-900">
                                  Arraste a imagem aqui{" "}
                                  <span className="text-gray-500 font-semibold">ou clique para selecionar</span>
                                </div>
                                <div className="text-[11px] text-gray-500 font-semibold mt-1 line-clamp-1">
                                  {formImageFile ? formImageFile.name : "PNG, JPG, WEBP..."}
                                </div>
                              </div>
                            </div>
                          </button>

                          {/* preview */}
                          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
                            <div className="h-[140px] w-full bg-gray-100 overflow-hidden">
                              {formImagePreview ? (
                                <img src={formImagePreview} alt="Preview" className="h-full w-full object-cover" />
                              ) : (
                                <div className="h-full w-full grid place-items-center text-gray-400 font-semibold">
                                  <div className="flex items-center gap-2">
                                    <ImageIcon className="h-5 w-5" />
                                    <span>Sem imagem</span>
                                  </div>
                                </div>
                              )}
                            </div>

                            <div className="p-2 flex items-center justify-between gap-2">
                              <div className="text-[11px] text-gray-600 font-semibold line-clamp-1">
                                {formImageFile ? formImageFile.name : "Nenhum arquivo selecionado"}
                              </div>

                              {formImageFile && (
                                <button
                                  type="button"
                                  onClick={() => setPickedFile(null)}
                                  className="h-8 px-3 rounded-2xl border border-gray-200 bg-white hover:bg-gray-50 font-extrabold text-[11px]"
                                  disabled={saving}
                                >
                                  Remover
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="text-[11px] text-gray-500 font-semibold">
                            Se você não escolher imagem, o aviso aparece com o logo.
                          </div>
                        </div>
                      </div>

                      {/* publicar/rascunho + ações */}
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setFormPublish(true)}
                          className={`h-10 px-4 rounded-2xl border font-extrabold text-[12px] transition-all active:scale-[0.99]
                            ${formPublish ? "bg-black text-white border-black" : "bg-white text-gray-900 border-gray-200 hover:bg-gray-50"}
                          `}
                          disabled={saving}
                        >
                          Publicar agora
                        </button>

                        <button
                          type="button"
                          onClick={() => setFormPublish(false)}
                          className={`h-10 px-4 rounded-2xl border font-extrabold text-[12px] transition-all active:scale-[0.99]
                            ${!formPublish ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-900 border-gray-200 hover:bg-gray-50"}
                          `}
                          disabled={saving}
                        >
                          Salvar como rascunho
                        </button>

                        <div className="flex-1" />

                        <button
                          type="button"
                          onClick={resetForm}
                          className="h-10 px-4 rounded-2xl border border-gray-200 bg-white hover:bg-gray-50 font-extrabold text-[12px] active:scale-[0.99]"
                          disabled={saving}
                        >
                          Limpar
                        </button>

                        <Button
                          onClick={handleCreateNotice}
                          className="h-10 rounded-2xl bg-[#9E0F14] hover:brightness-95 text-white font-extrabold px-5"
                          disabled={saving}
                        >
                          {saving ? "Salvando..." : "Salvar aviso"}
                        </Button>
                      </div>

                      <div className="text-[12px] text-gray-600 font-semibold">
                        Se salvar como <b>rascunho</b>, ele não aparece no banner até publicar.
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* lista (scroll) */}
              <div className="flex-1 overflow-auto p-4">
                {loading ? (
                  <div className="text-gray-500 font-semibold">Carregando...</div>
                ) : notices.length === 0 ? (
                  <div className="text-gray-500 font-semibold">Nenhum aviso publicado no momento.</div>
                ) : (
                  <div className="flex flex-col gap-4">
                    {notices.map((n, idx) => {
                      const active = idx === currentIndex;
                      const deleting = deletingId === n.id;

                      return (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => {
                            setCurrentIndex(idx);
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                          className={`
                            text-left w-full rounded-[24px] border p-4 transition-all duration-200
                            ${active ? "border-black ring-2 ring-black/10 bg-gray-50" : "border-gray-200 bg-white hover:bg-gray-50"}
                            active:scale-[0.99]
                          `}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-[16px] font-extrabold text-gray-900 line-clamp-1">
                                {n.title}
                              </div>
                              <div className="text-[13px] text-gray-600 mt-2 whitespace-pre-line line-clamp-3">
                                {n.body}
                              </div>

                              {n.created_at && (
                                <div className="mt-3 text-[11px] text-gray-500 font-semibold">
                                  {formatDateBR(n.created_at)}
                                </div>
                              )}
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {isAdmin && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleDeleteNotice(n);
                                  }}
                                  className={`
                                    h-10 w-10 rounded-2xl border flex items-center justify-center
                                    ${deleting ? "opacity-60" : ""}
                                    ${active ? "border-black bg-black text-white" : "border-gray-200 bg-white text-gray-800 hover:bg-gray-50"}
                                  `}
                                  disabled={deleting}
                                  title="Excluir aviso"
                                  aria-label="Excluir aviso"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}

                              <div
                                className={`
                                  h-10 w-10 rounded-2xl border flex items-center justify-center
                                  ${active ? "border-black bg-black text-white" : "border-gray-200 bg-white text-gray-800"}
                                `}
                                aria-hidden="true"
                              >
                                <ChevronRight className="h-6 w-6" />
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </aside>

          {/* RIGHT: CONTEÚDO (card espelho do Index) */}
          <section className="min-w-0">
            <div className="rounded-[28px] border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="p-4 border-b border-gray-100 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[16px] font-extrabold text-gray-900 line-clamp-1">
                    Visualização
                  </div>
                  <div className="text-[12px] text-gray-500 font-semibold mt-1 line-clamp-1">
                    Banner do totem / catálogo
                  </div>
                </div>

                {notices.length > 1 && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      className="h-11 w-11 rounded-2xl border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50 active:scale-[0.99]"
                      disabled={notices.length <= 1}
                      onClick={goPrev}
                      aria-label="Aviso anterior"
                      type="button"
                    >
                      <ChevronLeft className="h-6 w-6 mx-auto text-gray-800" />
                    </button>

                    <div className="text-[12px] text-gray-500 font-semibold min-w-[64px] text-center">
                      <span className="text-gray-900">{notices.length ? currentIndex + 1 : 0}</span> de{" "}
                      <span className="text-gray-900">{notices.length}</span>
                    </div>

                    <button
                      className="h-11 w-11 rounded-2xl border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50 active:scale-[0.99]"
                      disabled={notices.length <= 1}
                      onClick={goNext}
                      aria-label="Próximo aviso"
                      type="button"
                    >
                      <ChevronRight className="h-6 w-6 mx-auto text-gray-800" />
                    </button>
                  </div>
                )}
              </div>

              <div className="p-4">
                <div className="relative overflow-hidden rounded-[28px] bg-white border border-gray-200 shadow-sm">
                  <div className="h-[240px] md:h-[320px] w-full bg-gray-100 overflow-hidden">
                    {current?.image_url ? (
                      <img
                        src={current.image_url}
                        alt={current.title}
                        className="h-full w-full object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <div className="h-full w-full grid place-items-center text-gray-400 font-semibold">
                        <img src={logoGostinho} alt="GM" className="h-14 opacity-80" />
                      </div>
                    )}
                  </div>

                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/15 to-transparent" />

                  <div className="absolute left-5 right-5 bottom-5 text-white">
                    <div className="flex items-end justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[11px] font-extrabold tracking-[0.2em] opacity-90 uppercase">
                          Avisos e promoções
                        </div>

                        <div className="mt-1 text-[22px] md:text-[26px] font-extrabold leading-tight line-clamp-1">
                          {current?.title || (loading ? "Carregando..." : "Sem avisos")}
                        </div>

                        <div className="mt-1 text-[13px] md:text-[14px] opacity-90 line-clamp-2 whitespace-pre-line">
                          {current?.body || (loading ? "Aguarde um instante..." : "Nenhum aviso publicado.")}
                        </div>
                      </div>

                      {isAdmin && current?.id && (
                        <button
                          type="button"
                          onClick={() => handleDeleteNotice(current)}
                          className="
                            shrink-0 h-11 w-11 rounded-2xl bg-white/20 backdrop-blur
                            border border-white/25 hover:bg-white/25
                            active:scale-[0.99]
                          "
                          disabled={!!deletingId}
                          title="Excluir aviso"
                          aria-label="Excluir aviso"
                        >
                          <Trash2 className="h-5 w-5 mx-auto text-white" />
                        </button>
                      )}
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3">
                      <div className="text-[12px] opacity-85 font-semibold">
                        {current?.created_at ? <>Publicado em {formatDateBR(current.created_at)}</> : <>—</>}
                      </div>

                      {notices.length > 1 && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={goPrev}
                            className="
                              h-11 w-11 rounded-2xl bg-white/20 backdrop-blur
                              border border-white/25 hover:bg-white/25
                              active:scale-[0.99]
                            "
                            aria-label="Aviso anterior"
                            type="button"
                          >
                            <ChevronLeft className="h-6 w-6 mx-auto text-white" />
                          </button>

                          <button
                            onClick={goNext}
                            className="
                              h-11 w-11 rounded-2xl bg-white/20 backdrop-blur
                              border border-white/25 hover:bg-white/25
                              active:scale-[0.99]
                            "
                            aria-label="Próximo aviso"
                            type="button"
                          >
                            <ChevronRight className="h-6 w-6 mx-auto text-white" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* dicas / estados */}
                <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <div className="text-[13px] font-extrabold text-gray-900">Dica</div>
                  <div className="text-[12px] text-gray-600 font-semibold mt-1">
                    A imagem do aviso é usada como banner no catálogo (e no totem). Se não tiver imagem, aparece o logo.
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};

export default Avisos;