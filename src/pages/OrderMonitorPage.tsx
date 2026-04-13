import React from "react";
import { motion } from "framer-motion";
import { CalendarDays, Clock3, LogOut, RefreshCcw } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { OrderStatusBadge } from "@/components/orders-monitor/OrderStatusBadge";
import { OrderDetailsPanel } from "@/components/orders-monitor/OrderDetailsPanel";
import { OrdersMonitorEmpty } from "@/components/orders-monitor/OrdersMonitorEmpty";
import { OrdersMonitorFilters } from "@/components/orders-monitor/OrdersMonitorFilters";
import { OrdersMonitorList } from "@/components/orders-monitor/OrdersMonitorList";
import { OrdersMonitorSkeleton } from "@/components/orders-monitor/OrdersMonitorSkeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/components/ui/sonner";
import { useOrderMonitor } from "@/hooks/useOrderMonitor";
import { APP_EVENT, emitAppEvent } from "@/lib/appEvents";
import { retryOrderAutomation } from "@/services/orderMonitor";
import type { OrderMonitorOrder } from "@/types/order-monitor";
import { clearCustomerSession as clearStoredCustomerSession } from "@/utils/customerSession";

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const timeFormatter = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
});

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "long",
  year: "numeric",
});

function isToday(date: Date) {
  const today = new Date();
  return date.toDateString() === today.toDateString();
}

function rangeLabel(start: Date, end: Date) {
  const adjustedEnd = new Date(end);
  adjustedEnd.setDate(adjustedEnd.getDate() - 1);

  if (start.toDateString() === adjustedEnd.toDateString()) {
    return isToday(start) ? "Pedidos de hoje" : dateFormatter.format(start);
  }

  return `${dateFormatter.format(start)} ate ${dateFormatter.format(adjustedEnd)}`;
}

export default function OrderMonitorPage() {
  const navigate = useNavigate();
  const {
    loading,
    orders,
    recentOrders,
    selectedOrder,
    selectedOrderId,
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    sortBy,
    setSortBy,
    stats,
    isUsingMock,
    datePreset,
    setDatePreset,
    customDate,
    setCustomDate,
    dateRange,
    refreshOrders,
    openOrderDetails,
    closeOrderDetails,
  } = useOrderMonitor();
  const [retryStepOneOrder, setRetryStepOneOrder] = React.useState<OrderMonitorOrder | null>(null);
  const [retryStepTwoOrder, setRetryStepTwoOrder] = React.useState<OrderMonitorOrder | null>(null);
  const [retryPending, setRetryPending] = React.useState(false);

  function handleLogout() {
    try {
      localStorage.removeItem("pricing_context");
    } catch {}

    clearStoredCustomerSession();
    emitAppEvent(APP_EVENT.pricingContextChanged);
    navigate("/inicio", { replace: true });
  }

  async function handleRetryConfirm() {
    if (!retryStepTwoOrder) return;

    setRetryPending(true);
    try {
      await retryOrderAutomation(retryStepTwoOrder);
      toast("Pedido reenfileirado", {
        description: "A automacao recebeu nova tentativa de digitacao para este pedido.",
      });
      setRetryStepTwoOrder(null);
      setRetryStepOneOrder(null);
      await refreshOrders();
    } catch (error: any) {
      toast("Falha ao reenfileirar", {
        description: error?.message || "Nao foi possivel solicitar uma nova digitacao do pedido.",
      });
    } finally {
      setRetryPending(false);
    }
  }

  return (
    <main
      className="min-h-screen bg-[#f4f7fb] text-slate-950"
      style={{ fontFamily: '"Manrope", "Segoe UI", sans-serif' }}
    >
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(15,23,42,0.08),transparent_28%),radial-gradient(circle_at_top_right,rgba(14,165,233,0.16),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(245,158,11,0.12),transparent_26%)]" />
        <div className="absolute inset-x-0 top-0 h-[440px] bg-[linear-gradient(180deg,rgba(255,255,255,0.78),rgba(244,247,251,0.2),transparent)]" />

        <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={handleLogout}
              className="h-11 rounded-2xl border-slate-200 bg-white/85 px-4 text-slate-700 shadow-sm hover:bg-white"
            >
              <LogOut className="h-4 w-4" />
              Sair
            </Button>
          </div>

          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="overflow-hidden rounded-[36px] border border-white/60 bg-[linear-gradient(135deg,rgba(15,23,42,0.96),rgba(30,41,59,0.92)_55%,rgba(12,74,110,0.9))] px-5 py-6 text-white shadow-[0_32px_120px_rgba(15,23,42,0.24)] sm:px-7 sm:py-7"
          >
            <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr] xl:items-start">
              <div className="space-y-5">
                <div className="max-w-2xl">
                  <p className="text-sm font-medium text-slate-300">
                    Panorama do periodo
                  </p>
                  <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-[2.7rem]">
                    Acompanhe os pedidos em uma fila clara e pronta para atendimento.
                  </h1>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[26px] border border-white/12 bg-white/8 p-5 backdrop-blur-md">
                    <p className="text-sm font-medium text-slate-300">Pedidos ativos</p>
                    <p className="mt-3 text-4xl font-semibold tracking-[-0.04em]">{stats.totalOrders}</p>
                  </div>
                  <div className="rounded-[26px] border border-white/12 bg-white/8 p-5 backdrop-blur-md">
                    <p className="text-sm font-medium text-slate-300">Volume do turno</p>
                    <p className="mt-3 text-4xl font-semibold tracking-[-0.04em]">{currency.format(stats.revenue)}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.10),rgba(255,255,255,0.06))] p-5 backdrop-blur-md">
                <div className="flex items-center justify-between gap-4">
                  <h2 className="text-lg font-semibold tracking-[-0.03em] text-white">Entradas recentes</h2>
                  <span className="text-sm font-medium text-slate-300">{recentOrders.length} na fila curta</span>
                </div>

                <div className="mt-4 space-y-3">
                  {recentOrders.map((order) => (
                    <button
                      key={order.id}
                      type="button"
                      onClick={() => openOrderDetails(order.id)}
                      className="grid w-full grid-cols-[1fr_auto] gap-4 rounded-[24px] border border-white/8 bg-white/6 px-4 py-4 text-left transition-all hover:border-white/20 hover:bg-white/10"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-white">{order.customerName}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <OrderStatusBadge status={order.status} />
                        </div>
                      </div>

                      <div className="shrink-0 self-center text-right">
                        <p className="inline-flex items-center gap-2 text-sm font-medium text-slate-300">
                          <Clock3 className="h-3.5 w-3.5" />
                          {timeFormatter.format(new Date(order.createdAt))}
                        </p>
                        <p className="mt-2 text-base font-semibold text-slate-100">{currency.format(order.total)}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </motion.section>

          <OrdersMonitorFilters
            search={search}
            onSearchChange={setSearch}
            sortBy={sortBy}
            onSortByChange={setSortBy}
          />

          <section className="rounded-[28px] border border-white/65 bg-white/80 p-4 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur-xl">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-2 text-xl font-semibold tracking-[-0.03em] text-slate-950">
                <CalendarDays className="h-5 w-5 text-slate-500" />
                <span>{rangeLabel(dateRange.start, dateRange.end)}</span>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  className={`h-11 rounded-2xl border-slate-200 bg-white px-4 ${datePreset === "today" ? "border-slate-900 text-slate-950" : ""}`}
                  onClick={() => setDatePreset("today")}
                >
                  Hoje
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className={`h-11 rounded-2xl border-slate-200 bg-white px-4 ${datePreset === "yesterday" ? "border-slate-900 text-slate-950" : ""}`}
                  onClick={() => setDatePreset("yesterday")}
                >
                  Ontem
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className={`h-11 rounded-2xl border-slate-200 bg-white px-4 ${datePreset === "last7" ? "border-slate-900 text-slate-950" : ""}`}
                  onClick={() => setDatePreset("last7")}
                >
                  Ultimos 7 dias
                </Button>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className={`h-11 rounded-2xl border-slate-200 bg-white px-4 ${datePreset === "custom" ? "border-slate-900 text-slate-950" : ""}`}
                    >
                      Data especifica
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-auto rounded-[24px] border-slate-200 bg-white p-2">
                    <Calendar
                      mode="single"
                      selected={customDate}
                      onSelect={(date) => {
                        if (!date) return;
                        const next = new Date(date);
                        next.setHours(0, 0, 0, 0);
                        setCustomDate(next);
                        setDatePreset("custom");
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 rounded-2xl border-slate-200 bg-white px-4"
                  onClick={() => {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    setCustomDate(today);
                    setDatePreset("custom");
                  }}
                >
                  Ir para data
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 rounded-2xl border-slate-200 bg-white px-4"
                  onClick={() => void refreshOrders()}
                >
                  <RefreshCcw className="h-4 w-4" />
                  Atualizar
                </Button>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            {isUsingMock ? (
              <p className="text-sm text-amber-700">
                Exibindo demonstracao local porque os pedidos reais nao puderam ser carregados agora.
              </p>
            ) : null}
            {loading ? (
              <OrdersMonitorSkeleton />
            ) : orders.length ? (
              <OrdersMonitorList orders={orders} onOpenDetails={openOrderDetails} />
            ) : (
              <OrdersMonitorEmpty
                onReset={() => {
                  setSearch("");
                  setStatusFilter("todos");
                  setSortBy("recentes");
                }}
              />
            )}
          </section>
        </div>
      </div>

      <OrderDetailsPanel
        order={selectedOrder}
        open={Boolean(selectedOrderId)}
        onOpenChange={(open) => {
          if (!open) closeOrderDetails();
        }}
      />

      <AlertDialog
        open={Boolean(retryStepOneOrder)}
        onOpenChange={(open) => {
          if (!open) setRetryStepOneOrder(null);
        }}
      >
        <AlertDialogContent className="max-w-md rounded-[28px] border-none bg-white p-6 shadow-[0_28px_90px_rgba(15,23,42,0.18)]">
          <AlertDialogHeader>
            <AlertDialogTitle>Reenviar para automacao?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso vai recolocar o pedido em fila para uma nova tentativa de digitacao no SAIBWEB.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-2xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-2xl bg-slate-950 text-white hover:bg-slate-900"
              onClick={() => {
                if (!retryStepOneOrder) return;
                setRetryStepTwoOrder(retryStepOneOrder);
                setRetryStepOneOrder(null);
              }}
            >
              Continuar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(retryStepTwoOrder)}
        onOpenChange={(open) => {
          if (!open) setRetryStepTwoOrder(null);
        }}
      >
        <AlertDialogContent className="max-w-md rounded-[28px] border-none bg-white p-6 shadow-[0_28px_90px_rgba(15,23,42,0.18)]">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar nova digitacao</AlertDialogTitle>
            <AlertDialogDescription>
              Confirme apenas se voce verificou que o pedido nao foi digitado corretamente. Essa acao tenta processar o
              mesmo pedido novamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-2xl" disabled={retryPending}>
              Voltar
            </AlertDialogCancel>
            <AlertDialogAction
              className="rounded-2xl bg-rose-600 text-white hover:bg-rose-700"
              onClick={(event) => {
                event.preventDefault();
                void handleRetryConfirm();
              }}
            >
              {retryPending ? "Reenfileirando..." : "Confirmar reenvio"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
