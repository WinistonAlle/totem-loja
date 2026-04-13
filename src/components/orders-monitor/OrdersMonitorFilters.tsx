import { ArrowUpDown, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Props = {
  search: string;
  onSearchChange: (value: string) => void;
  sortBy: string;
  onSortByChange: (value: string) => void;
};

export function OrdersMonitorFilters({
  search,
  onSearchChange,
  sortBy,
  onSortByChange,
}: Props) {
  return (
    <section className="relative overflow-hidden rounded-[28px] border border-white/65 bg-white/78 p-4 shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur-xl">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.08),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(245,158,11,0.08),transparent_30%)]" />

      <div className="relative grid gap-3 lg:grid-cols-[1.8fr_0.8fr]">
        <label className="group block">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-slate-700" />
            <Input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Buscar por cliente ou numero do pedido"
              className="h-12 rounded-2xl border-white/70 bg-white/85 pl-11 text-sm shadow-sm transition-all focus-visible:ring-slate-300"
            />
          </div>
        </label>

        <label className="block">
          <Select value={sortBy} onValueChange={onSortByChange}>
            <SelectTrigger className="h-12 rounded-2xl border-white/70 bg-white/85 shadow-sm">
              <span className="inline-flex items-center gap-2">
                <ArrowUpDown className="h-4 w-4 text-slate-400" />
                <SelectValue placeholder="Mais recentes" />
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recentes">Mais recentes</SelectItem>
              <SelectItem value="antigos">Mais antigos</SelectItem>
              <SelectItem value="cliente">Nome do cliente</SelectItem>
            </SelectContent>
          </Select>
        </label>
      </div>
    </section>
  );
}
