// src/App.tsx
import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import AppErrorBoundary from "@/components/AppErrorBoundary";
import { APP_EVENT, emitAppEvent, subscribeAppEvent } from "@/lib/appEvents";
import { recordSystemEvent } from "@/lib/systemEvents";
import {
  clearCustomerSession,
  getCustomerSessionSnapshotOrNull,
  saveCustomerSession,
} from "@/utils/customerSession";

import { CartProvider } from "@/contexts/CartContext";
import { useCart } from "@/contexts/CartContext";
import { clearAllCartKeysFromStorage } from "@/utils/cartStorage";
import { supabase } from "@/lib/supabase";

const Login = lazy(() => import("./pages/Login"));
const Cadastro = lazy(() => import("./pages/Cadastro"));
const Index = lazy(() => import("./pages/Index"));
const Checkout = lazy(() => import("./pages/Checkout"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Start = lazy(() => import("./pages/Start"));
const ContextoCompra = lazy(() => import("./pages/ContextoCompra"));
const Avisos = lazy(() => import("./pages/Avisos"));
const FavoritesPage = lazy(() => import("./pages/Favorites"));
const Destaques = lazy(() => import("./pages/Destaques"));
const Admin = lazy(() => import("./pages/Admin"));
const ReportsDashboard = lazy(() => import("./pages/ReportsDashboard"));
const AdminOrders = lazy(() => import("./pages/AdminOrders"));
const SystemDiagnostics = lazy(() => import("./pages/SystemDiagnostics"));

const queryClient = new QueryClient();

type Role = "admin" | "clientecpf" | "clientecnpj" | "cliente" | string;

type CustomerSession = {
  id?: string | number;
  name?: string | null;
  document?: string | null;
  role?: Role | null;
};

// ✅ robusto: aceita document em variações (caso seu banco esteja diferente)
function getCustomerSession(): CustomerSession | null {
  const parsed = getCustomerSessionSnapshotOrNull<CustomerSession & Record<string, unknown>>();
  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const id = parsed.id ?? parsed.customer_id ?? parsed.user_id ?? null;
  const document =
    parsed.document ??
    parsed.customer_document ??
    parsed.cpf ??
    parsed.cnpj ??
    parsed.doc ??
    null;

  if (!id && !document) return null;

  return {
    id: typeof id === "string" || typeof id === "number" ? id : undefined,
    name:
      typeof parsed.name === "string"
        ? parsed.name
        : typeof parsed.customer_name === "string"
        ? parsed.customer_name
        : typeof parsed.full_name === "string"
        ? parsed.full_name
        : null,
    document: typeof document === "string" ? document : null,
    role: (parsed.role ?? parsed.tipo ?? null) as Role | null,
  };
}

/* --------------------------------------------------------
   ROUTE GUARDS
-------------------------------------------------------- */

function RequireAuth({ children }: { children: JSX.Element }) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "customer_session") setTick((t) => t + 1);
    };
    window.addEventListener("storage", onStorage);

    const onLocal = () => setTick((t) => t + 1);
    const unsubscribe = subscribeAppEvent(APP_EVENT.customerSessionChanged, onLocal);

    return () => {
      window.removeEventListener("storage", onStorage);
      unsubscribe();
    };
  }, []);

  void tick;

  const cust = getCustomerSession();
  if (!cust) return <Navigate to="/login" replace />;
  return children;
}

function RequireRole({
  allow,
  redirectTo = "/catalogo",
  children,
}: {
  allow: Role[];
  redirectTo?: string;
  children: JSX.Element;
}) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "customer_session") setTick((t) => t + 1);
    };
    window.addEventListener("storage", onStorage);

    const onLocal = () => setTick((t) => t + 1);
    const unsubscribe = subscribeAppEvent(APP_EVENT.customerSessionChanged, onLocal);

    return () => {
      window.removeEventListener("storage", onStorage);
      unsubscribe();
    };
  }, []);

  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let alive = true;

    async function run() {
      setLoading(true);
      try {
        const session = getCustomerSession();
        if (!session) {
          if (!alive) return;
          setAllowed(false);
          setLoading(false);
          return;
        }

        if (session.role) {
          if (!alive) return;
          setAllowed(allow.includes(session.role));
          setLoading(false);
          return;
        }

        let role: string | null = null;

        const idToCheck = session.id ? String(session.id) : null;
        if (idToCheck) {
          const { data, error } = await supabase
            .from("customers")
            .select("role")
            .eq("id", idToCheck)
            .maybeSingle();

          if (error) console.error("RequireRole: erro customers por id:", error);
          role = (data?.role as string | null) ?? null;
        }

        if (!role && session.document) {
          const { data, error } = await supabase
            .from("customers")
            .select("role")
            .eq("document", session.document)
            .maybeSingle();

          if (error) console.error("RequireRole: erro customers por document:", error);
          role = (data?.role as string | null) ?? null;
        }

        if (role) {
          try {
            const fresh = getCustomerSession();
            if (fresh) {
              saveCustomerSession({ ...fresh, role });
            }
          } catch {}
        }

        if (!alive) return;
        setAllowed(role ? allow.includes(role) : false);
        setLoading(false);
      } catch (e) {
        console.error("RequireRole: erro inesperado:", e);
        if (!alive) return;
        setAllowed(false);
        setLoading(false);
      }
    }

    run();

    return () => {
      alive = false;
    };
  }, [tick, allow, redirectTo]);

  if (loading) return null;
  if (!allowed) return <Navigate to={redirectTo} replace />;
  return children;
}

/* --------------------------------------------------------
   ROOT
-------------------------------------------------------- */
function RootRedirect() {
  return <Navigate to="/inicio" replace />;
}

function GlobalInactivityGuard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { clearCart, closeCart } = useCart();
  const isDisabledRoute = ["/inicio", "/checkout"].includes(location.pathname);

  const INACTIVITY_LIMIT = 25000;
  const COUNTDOWN_SECONDS = 5;

  const [isIdleWarning, setIsIdleWarning] = useState(false);
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);

  const idleTimeoutRef = useRef<number | null>(null);
  const countdownIntervalRef = useRef<number | null>(null);

  const resetTotemSessionAndGoStart = () => {
    try {
      closeCart();
      clearCart();
      clearAllCartKeysFromStorage();

      localStorage.removeItem("pricing_context");
      clearCustomerSession();
      emitAppEvent(APP_EVENT.pricingContextChanged);
    } catch {}

    navigate("/inicio", { replace: true });
  };

  useEffect(() => {
    if (isDisabledRoute) {
      setIsIdleWarning(false);
      setCountdown(COUNTDOWN_SECONDS);
      return;
    }

    const clearAllTimers = () => {
      if (idleTimeoutRef.current) {
        clearTimeout(idleTimeoutRef.current);
        idleTimeoutRef.current = null;
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    };

    const startCountdown = () => {
      setIsIdleWarning(true);
      setCountdown(COUNTDOWN_SECONDS);

      countdownIntervalRef.current = window.setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearAllTimers();
            setIsIdleWarning(false);
            resetTotemSessionAndGoStart();
            return COUNTDOWN_SECONDS;
          }

          return prev - 1;
        });
      }, 1000);
    };

    const resetIdleTimer = () => {
      setIsIdleWarning(false);
      setCountdown(COUNTDOWN_SECONDS);

      clearAllTimers();
      idleTimeoutRef.current = window.setTimeout(startCountdown, INACTIVITY_LIMIT);
    };

    const events: Array<keyof WindowEventMap> = [
      "pointerdown",
      "touchstart",
      "mousemove",
      "keydown",
      "scroll",
      "wheel",
    ];

    events.forEach((eventName) => {
      window.addEventListener(eventName, resetIdleTimer, { passive: true } as AddEventListenerOptions);
    });

    resetIdleTimer();

    return () => {
      clearAllTimers();
      events.forEach((eventName) => {
        window.removeEventListener(eventName, resetIdleTimer, { passive: true } as EventListenerOptions);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDisabledRoute, location.pathname, navigate, clearCart, closeCart]);

  if (isDisabledRoute || !isIdleWarning) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/75 backdrop-blur-md flex items-center justify-center px-4">
      <style>{`
        @keyframes gmIdleOverlayIn {
          0% { opacity: 0; transform: translateY(12px) scale(.96); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes gmIdlePulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.06); }
        }
        @keyframes gmIdleRing {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>

      <div
        className="w-[420px] max-w-[92vw] rounded-[26px] sm:rounded-[30px] border border-white/60 bg-white/95 p-6 sm:p-8 text-center shadow-[0_24px_80px_rgba(0,0,0,0.32)]"
        style={{ animation: "gmIdleOverlayIn 240ms ease-out both" }}
      >
        <div className="mx-auto mb-4 sm:mb-5 flex h-[108px] w-[108px] sm:h-[126px] sm:w-[126px] items-center justify-center rounded-full bg-gradient-to-br from-red-50 via-amber-50 to-red-100 shadow-inner">
          <div
            className="absolute h-[108px] w-[108px] sm:h-[126px] sm:w-[126px] rounded-full border-4 border-[#9E0F14]/12 border-t-[#9E0F14]/70"
            style={{ animation: "gmIdleRing 5s linear infinite" }}
          />
          <div
            className="relative flex h-[82px] w-[82px] sm:h-[96px] sm:w-[96px] items-center justify-center rounded-full bg-white text-[46px] sm:text-[56px] font-extrabold text-[#9E0F14] shadow-[0_10px_28px_rgba(158,15,20,0.16)]"
            style={{ animation: "gmIdlePulse 1s ease-in-out infinite" }}
          >
            {countdown}
          </div>
        </div>

        <h2 className="text-[22px] sm:text-[26px] font-extrabold text-gray-900 mb-2">Sessão inativa</h2>
        <p className="text-sm sm:text-base text-gray-600 font-semibold mb-2">Voltando para o início automaticamente</p>
        <p className="text-[13px] sm:text-sm text-gray-500 font-semibold">Toque em qualquer lugar para continuar</p>

        <div className="mt-5 sm:mt-6 h-2 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            key={countdown}
            className="h-full rounded-full bg-gradient-to-r from-[#9E0F14] via-[#c22b2b] to-[#e07a5f]"
            style={{
              width: `${(countdown / COUNTDOWN_SECONDS) * 100}%`,
              transition: "width 900ms linear",
            }}
          />
        </div>
      </div>
    </div>
  );
}

function AppRoutes() {
  return (
    <>
      <Suspense
        fallback={
          <div className="min-h-[100dvh] grid place-items-center bg-white text-gray-500 font-semibold">
            Carregando...
          </div>
        }
      >
        <Routes>
          {/* ✅ abre no totem */}
          <Route path="/" element={<RootRedirect />} />

          {/* ✅ fluxo do totem */}
          <Route path="/inicio" element={<Start />} />
          <Route path="/contexto" element={<ContextoCompra />} />

          {/* ✅ catálogo NÃO exige login (login/cadastro ficam como opção dentro dele) */}
          <Route path="/catalogo" element={<Index />} />

          {/* auth */}
          <Route path="/login" element={<Login />} />
          <Route path="/cadastro" element={<Cadastro />} />

          <Route
            path="/destaques"
            element={
              <RequireAuth>
                <Destaques />
              </RequireAuth>
            }
          />

          <Route
            path="/favoritos"
            element={
              <RequireAuth>
                <FavoritesPage />
              </RequireAuth>
            }
          />

          <Route
            path="/avisos"
            element={
              <RequireAuth>
                <Avisos />
              </RequireAuth>
            }
          />

          <Route path="/meus-pedidos" element={<Navigate to="/inicio" replace />} />

          <Route path="/checkout" element={<Checkout />} />

          <Route
            path="/diagnostico"
            element={
              <RequireRole allow={["admin"]} redirectTo="/catalogo">
                <SystemDiagnostics />
              </RequireRole>
            }
          />

          <Route
            path="/admin"
            element={
              <RequireRole allow={["admin"]} redirectTo="/catalogo">
                <Admin />
              </RequireRole>
            }
          />

          <Route
            path="/admin/pedidos"
            element={
              <RequireRole allow={["admin"]} redirectTo="/catalogo">
                <AdminOrders />
              </RequireRole>
            }
          />

          <Route path="/pedidosadmin" element={<Navigate to="/admin/pedidos" replace />} />
          <Route path="/adminorders" element={<Navigate to="/admin/pedidos" replace />} />

          <Route
            path="/relatorios"
            element={
              <RequireRole allow={["admin"]} redirectTo="/catalogo">
                <ReportsDashboard />
              </RequireRole>
            }
          />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>

      <GlobalInactivityGuard />
    </>
  );
}

function SystemTelemetryBootstrap() {
  useEffect(() => {
    void recordSystemEvent({
      eventName: "app_boot",
      severity: "info",
      message: "Totem iniciado.",
      payload: {
        path: window.location.pathname,
      },
    });

    const onOnline = () => {
      void recordSystemEvent({
        eventName: "network_online",
        severity: "info",
        message: "Conexao com a internet restabelecida.",
      });
    };

    const onOffline = () => {
      void recordSystemEvent({
        eventName: "network_offline",
        severity: "warning",
        message: "Totem ficou offline.",
      });
    };

    const onError = (event: ErrorEvent) => {
      void recordSystemEvent({
        eventName: "app_runtime_error",
        severity: "error",
        message: event.message || "Erro global nao tratado.",
        payload: {
          filename: event.filename,
          line: event.lineno,
          column: event.colno,
        },
      });
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      void recordSystemEvent({
        eventName: "app_unhandled_rejection",
        severity: "error",
        message: String(reason?.message ?? reason ?? "Promise rejeitada sem tratamento."),
      });
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  return null;
}

/* --------------------------------------------------------
   APP
-------------------------------------------------------- */
function App() {
  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />

          <CartProvider>
            <BrowserRouter>
              <SystemTelemetryBootstrap />
              <AppRoutes />
            </BrowserRouter>
          </CartProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  );
}

export default App;
