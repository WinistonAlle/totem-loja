import type { OrderMonitorStatus } from "@/types/order-monitor";
import { cn } from "@/lib/utils";

const STATUS_MAP: Record<OrderMonitorStatus, { label: string; className: string }> = {
  novo: {
    label: "Novo",
    className: "border-emerald-500/30 bg-emerald-500/12 text-emerald-700",
  },
  em_preparo: {
    label: "Em preparo",
    className: "border-amber-500/30 bg-amber-500/12 text-amber-700",
  },
  pronto: {
    label: "Pronto",
    className: "border-sky-500/30 bg-sky-500/12 text-sky-700",
  },
  finalizado: {
    label: "Finalizado",
    className: "border-slate-400/30 bg-slate-500/10 text-slate-700",
  },
  cancelado: {
    label: "Cancelado",
    className: "border-rose-500/30 bg-rose-500/12 text-rose-700",
  },
};

export function OrderStatusBadge({ status }: { status: OrderMonitorStatus }) {
  const config = STATUS_MAP[status];

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold tracking-[0.02em]",
        config.className
      )}
    >
      {config.label}
    </span>
  );
}
