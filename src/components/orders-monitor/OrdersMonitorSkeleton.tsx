import { Skeleton } from "@/components/ui/skeleton";

export function OrdersMonitorSkeleton() {
  return (
    <div className="overflow-hidden rounded-[30px] border border-white/70 bg-white/88 shadow-[0_26px_80px_rgba(15,23,42,0.08)]">
      <div className="hidden grid-cols-[1.6fr_0.9fr_0.8fr_0.7fr] gap-4 border-b border-slate-200/80 bg-slate-50/90 px-5 py-4 md:grid">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-20" />
      </div>
      <div className="divide-y divide-slate-200/80">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="grid gap-3 px-5 py-4 md:grid-cols-[1.6fr_0.9fr_0.8fr_0.7fr] md:items-center">
            <Skeleton className="h-6 w-48 rounded-xl" />
            <Skeleton className="h-5 w-28 rounded-xl" />
            <Skeleton className="h-5 w-20 rounded-xl" />
            <Skeleton className="h-5 w-16 rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  );
}
