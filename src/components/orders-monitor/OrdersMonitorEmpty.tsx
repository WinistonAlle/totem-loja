import { Inbox, SearchX } from "lucide-react";

import { Button } from "@/components/ui/button";

export function OrdersMonitorEmpty({ onReset }: { onReset: () => void }) {
  return (
    <section className="rounded-[32px] border border-dashed border-slate-300 bg-white/75 p-8 text-center shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-950 text-white shadow-lg">
        <SearchX className="h-7 w-7" />
      </div>

      <h3 className="mt-5 text-2xl font-semibold tracking-[-0.03em] text-slate-950">Nenhum pedido encontrado</h3>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-500">
        Ajuste a busca ou os filtros para voltar a enxergar os pedidos. A estrutura da tela ja esta pronta para receber
        dados reais quando a integracao for conectada.
      </p>

      <div className="mt-6 flex items-center justify-center gap-3">
        <Button
          onClick={onReset}
          className="rounded-2xl bg-slate-950 px-5 text-white hover:bg-slate-900"
        >
          <Inbox className="mr-2 h-4 w-4" />
          Limpar filtros
        </Button>
      </div>
    </section>
  );
}
