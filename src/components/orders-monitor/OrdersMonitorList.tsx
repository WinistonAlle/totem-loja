import { motion } from "framer-motion";
import { Clock3, Package2, Receipt } from "lucide-react";

import type { OrderMonitorOrder } from "@/types/order-monitor";

type Props = {
  orders: OrderMonitorOrder[];
  onOpenDetails: (orderId: string) => void;
};

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const timeFormatter = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
});

export function OrdersMonitorList({ orders, onOpenDetails }: Props) {
  return (
    <section className="overflow-hidden rounded-[30px] border border-white/70 bg-white/84 shadow-[0_26px_80px_rgba(15,23,42,0.08)] backdrop-blur-xl">
      <div className="hidden grid-cols-[1.6fr_0.9fr_0.8fr_0.7fr] gap-4 border-b border-slate-200/80 bg-slate-50/90 px-5 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 md:grid">
        <div>Nome</div>
        <div>Valor total</div>
        <div>Itens</div>
        <div>Horario</div>
      </div>

      <div className="divide-y divide-slate-200/80">
        {orders.map((order, index) => {
          const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);

          return (
            <motion.button
              key={order.id}
              type="button"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, delay: index * 0.03 }}
              onClick={() => onOpenDetails(order.id)}
              className="grid w-full gap-3 px-5 py-4 text-left transition-colors hover:bg-slate-50/90 focus-visible:bg-slate-50/90 focus-visible:outline-none md:grid-cols-[1.6fr_0.9fr_0.8fr_0.7fr] md:items-center"
            >
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 md:hidden">Nome</p>
                <p className="truncate text-base font-semibold text-slate-950">{order.customerName}</p>
              </div>

              <div>
                <p className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 md:hidden">
                  <Receipt className="h-3.5 w-3.5" />
                  Valor total
                </p>
                <p className="text-sm font-medium text-slate-700">{currency.format(order.total)}</p>
              </div>

              <div>
                <p className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 md:hidden">
                  <Package2 className="h-3.5 w-3.5" />
                  Itens
                </p>
                <p className="text-sm font-medium text-slate-700">{itemCount} item(ns)</p>
              </div>

              <div>
                <p className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 md:hidden">
                  <Clock3 className="h-3.5 w-3.5" />
                  Horario
                </p>
                <p className="text-sm font-medium text-slate-700">{timeFormatter.format(new Date(order.createdAt))}</p>
              </div>
            </motion.button>
          );
        })}
      </div>
    </section>
  );
}
