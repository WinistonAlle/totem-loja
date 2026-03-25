import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { clearStoredSystemEvents, listStoredSystemEvents } from "@/lib/systemEvents";

const PRODUCTS_CACHE_KEY = "gm_catalog_products_v2";

type CatalogCacheSnapshot = {
  cachedAt: number | null;
  items: number;
};

function readCatalogCache(): CatalogCacheSnapshot {
  try {
    const raw = localStorage.getItem(PRODUCTS_CACHE_KEY);
    if (!raw) return { cachedAt: null, items: 0 };
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed?.items) ? parsed.items.length : 0;
    const cachedAt = Number.isFinite(Number(parsed?.cachedAt)) ? Number(parsed.cachedAt) : null;
    return { cachedAt, items };
  } catch {
    return { cachedAt: null, items: 0 };
  }
}

function formatRelativeTime(timestamp: string | number | null) {
  if (!timestamp) return "sem registro";
  const value = typeof timestamp === "number" ? timestamp : Date.parse(timestamp);
  if (!Number.isFinite(value)) return "sem registro";

  const diffMs = Date.now() - value;
  if (diffMs < 60_000) return "agora";
  if (diffMs < 3_600_000) return `${Math.round(diffMs / 60_000)} min atrás`;
  return `${Math.round(diffMs / 3_600_000)} h atrás`;
}

const SystemDiagnostics: React.FC = () => {
  const navigate = useNavigate();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const onFocus = () => setTick((value) => value + 1);
    const onOnline = () => setTick((value) => value + 1);
    const onStorage = () => setTick((value) => value + 1);

    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOnline);
    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOnline);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const events = useMemo(() => {
    void tick;
    return listStoredSystemEvents();
  }, [tick]);
  const cache = readCatalogCache();
  const latestCatalogEvent = events.find((event) => event.eventName === "catalog_load_success") ?? null;
  const latestCatalogFailure = events.find((event) => event.eventName === "catalog_load_failure") ?? null;
  const latestOrderSuccess = events.find((event) => event.eventName === "order_success") ?? null;
  const latestOrderFailure = events.find((event) => event.eventName === "order_failure") ?? null;

  return (
    <div className="min-h-screen bg-[#f4f1eb] px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="rounded-[28px] border border-black/5 bg-white px-5 py-5 shadow-[0_18px_50px_rgba(0,0,0,0.08)] sm:px-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.22em] text-[#9E0F14]">Diagnóstico</p>
              <h1 className="mt-1 text-3xl font-black text-gray-950">Saúde operacional do totem</h1>
              <p className="mt-2 text-sm font-medium text-gray-600">
                Tela reservada para suporte. Mostra rede, cache, pedidos e histórico recente de falhas.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button variant="outline" onClick={() => setTick((value) => value + 1)}>
                Atualizar
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  clearStoredSystemEvents();
                  setTick((value) => value + 1);
                }}
              >
                Limpar eventos
              </Button>
              <Button onClick={() => navigate("/inicio", { replace: true })}>Voltar ao início</Button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[24px] border border-emerald-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-700">Rede</p>
            <p className="mt-3 text-3xl font-black text-gray-950">{navigator.onLine ? "Online" : "Offline"}</p>
            <p className="mt-2 text-sm font-medium text-gray-500">Monitorado em tempo real pelo navegador.</p>
          </div>

          <div className="rounded-[24px] border border-amber-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-amber-700">Cache do catálogo</p>
            <p className="mt-3 text-3xl font-black text-gray-950">
              {cache.cachedAt ? formatRelativeTime(cache.cachedAt) : "vazio"}
            </p>
            <p className="mt-2 text-sm font-medium text-gray-500">{cache.items} itens armazenados localmente.</p>
          </div>

          <div className="rounded-[24px] border border-sky-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-sky-700">Último catálogo OK</p>
            <p className="mt-3 text-3xl font-black text-gray-950">
              {formatRelativeTime(latestCatalogEvent?.createdAt ?? null)}
            </p>
            <p className="mt-2 text-sm font-medium text-gray-500">
              {latestCatalogEvent?.message ?? "Sem leitura bem-sucedida registrada."}
            </p>
          </div>

          <div className="rounded-[24px] border border-rose-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-rose-700">Última falha</p>
            <p className="mt-3 text-3xl font-black text-gray-950">
              {latestOrderFailure || latestCatalogFailure
                ? formatRelativeTime((latestOrderFailure ?? latestCatalogFailure)?.createdAt ?? null)
                : "nenhuma"}
            </p>
            <p className="mt-2 text-sm font-medium text-gray-500">
              {(latestOrderFailure ?? latestCatalogFailure)?.message ?? "Nenhuma falha recente registrada."}
            </p>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.1fr_1.6fr]">
          <div className="rounded-[28px] border border-black/5 bg-white p-5 shadow-[0_14px_38px_rgba(0,0,0,0.06)]">
            <h2 className="text-xl font-black text-gray-950">Resumo rápido</h2>
            <div className="mt-4 space-y-3 text-sm font-medium text-gray-700">
              <div className="rounded-2xl bg-[#f7f5f0] px-4 py-3">
                <span className="font-black text-gray-950">Último pedido com sucesso:</span>{" "}
                {latestOrderSuccess
                  ? `${formatRelativeTime(latestOrderSuccess.createdAt)} (${latestOrderSuccess.message})`
                  : "sem registro"}
              </div>
              <div className="rounded-2xl bg-[#f7f5f0] px-4 py-3">
                <span className="font-black text-gray-950">Modo RPC obrigatório:</span>{" "}
                {String(import.meta.env.VITE_REQUIRE_ORDER_RPC ?? "").toLowerCase() === "true" ? "ativo" : "inativo"}
              </div>
              <div className="rounded-2xl bg-[#f7f5f0] px-4 py-3">
                <span className="font-black text-gray-950">Eventos em memória local:</span> {events.length}
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-black/5 bg-white p-5 shadow-[0_14px_38px_rgba(0,0,0,0.06)]">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-black text-gray-950">Eventos recentes</h2>
              <span className="rounded-full bg-[#f7f5f0] px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-gray-500">
                {events.length} registros
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {events.length === 0 ? (
                <div className="rounded-[22px] border border-dashed border-gray-200 bg-[#faf9f6] px-4 py-10 text-center text-sm font-medium text-gray-500">
                  Nenhum evento registrado ainda neste navegador.
                </div>
              ) : (
                events.map((event) => (
                  <div key={event.id} className="rounded-[22px] border border-gray-100 bg-[#faf9f6] px-4 py-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-black uppercase tracking-[0.16em] text-gray-500">{event.eventName}</p>
                        <p className="mt-1 text-base font-semibold text-gray-900">{event.message}</p>
                      </div>
                      <span
                        className={[
                          "inline-flex rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.16em]",
                          event.severity === "error"
                            ? "bg-rose-100 text-rose-700"
                            : event.severity === "warning"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-emerald-100 text-emerald-700",
                        ].join(" ")}
                      >
                        {event.severity}
                      </span>
                    </div>

                    <p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">
                      {new Date(event.createdAt).toLocaleString("pt-BR")}
                    </p>

                    {event.payload ? (
                      <pre className="mt-3 overflow-auto rounded-2xl bg-white px-3 py-3 text-xs leading-5 text-gray-600">
                        {JSON.stringify(event.payload, null, 2)}
                      </pre>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SystemDiagnostics;
