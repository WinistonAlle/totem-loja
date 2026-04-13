import { AlertTriangle, Clock3, Receipt, ShoppingBag, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { OrderStatusBadge } from "@/components/orders-monitor/OrderStatusBadge";
import { useIsMobile } from "@/hooks/use-mobile";
import type { OrderMonitorOrder } from "@/types/order-monitor";

type Props = {
  order: OrderMonitorOrder | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  day: "2-digit",
  month: "2-digit",
});

function OrderDetailsBody({
  order,
  onClose,
}: {
  order: OrderMonitorOrder;
  onClose: () => void;
}) {
  const totalItems = order.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <OrderStatusBadge status={order.status} />
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Cliente</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">{order.customerName}</h2>
          </div>
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="rounded-2xl text-slate-500 hover:bg-slate-100 hover:text-slate-900"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="mt-6 flex-1 pr-4">
        <div className="space-y-6 pb-6">
          <section className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/80 p-4">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                <Clock3 className="h-3.5 w-3.5" />
                Horario
              </p>
              <p className="mt-2 text-sm font-medium text-slate-700">{dateTimeFormatter.format(new Date(order.createdAt))}</p>
            </div>

            <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/80 p-4">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                <ShoppingBag className="h-3.5 w-3.5" />
                Quantidade
              </p>
              <p className="mt-2 text-sm font-medium text-slate-700">{totalItems} item(ns)</p>
            </div>

            <div className="rounded-[24px] border border-slate-200/80 bg-slate-950 p-4 text-white">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                <Receipt className="h-3.5 w-3.5" />
                Valor total
              </p>
              <p className="mt-2 text-lg font-semibold">{currency.format(order.total)}</p>
            </div>
          </section>

          <section className="rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Itens do pedido</p>
                <h3 className="mt-2 text-lg font-semibold text-slate-950">Lista completa para conferencia</h3>
              </div>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">
                {totalItems} item(ns)
              </span>
            </div>

            <div className="mt-5 space-y-3">
              {order.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-[22px] border border-slate-200/70 bg-slate-50/70 px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{item.name}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-400">Item solicitado</p>
                  </div>
                  <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold text-white">
                    x{item.quantity}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {order.saibwebStatus === "ERROR" ? (
            <section className="rounded-[28px] border border-rose-200 bg-rose-50/80 p-5 text-rose-900">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-rose-500">
                <AlertTriangle className="h-3.5 w-3.5" />
                Atencao
              </p>
              <p className="mt-3 text-sm leading-6">
                Esse pedido registrou falha na automacao. Use o reenvio manual apenas se tiver certeza de que o pedido
                nao foi digitado corretamente no SAIBWEB.
              </p>
            </section>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );
}

export function OrderDetailsPanel({ order, open, onOpenChange, onRetryRequest, retryPending }: Props) {
  const isMobile = useIsMobile();

  if (!order) return null;

  if (isMobile) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[92vh] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-[28px] border-none bg-white p-5 shadow-[0_30px_90px_rgba(15,23,42,0.25)]">
          <DialogTitle className="sr-only">Detalhes do pedido</DialogTitle>
          <DialogDescription className="sr-only">Painel com informacoes completas do pedido selecionado.</DialogDescription>
          <OrderDetailsBody order={order} onClose={() => onOpenChange(false)} />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full border-none bg-white p-6 shadow-[0_34px_100px_rgba(15,23,42,0.20)] sm:max-w-[540px]">
        <SheetTitle className="sr-only">Detalhes do pedido</SheetTitle>
        <SheetDescription className="sr-only">Painel com informacoes completas do pedido selecionado.</SheetDescription>
        <OrderDetailsBody order={order} onClose={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  );
}
