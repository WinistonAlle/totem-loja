// src/components/CartToggle.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ShoppingBag } from "lucide-react";
import { useCart } from "../contexts/CartContext";

const WHOLESALE_WEIGHT_THRESHOLD_KG = 15;

function getPricingChannel(): "varejo" | "atacado" {
  try {
    const raw = localStorage.getItem("pricing_context");
    if (!raw) return "varejo";
    const parsed = JSON.parse(raw);
    return parsed?.channel === "atacado" ? "atacado" : "varejo";
  } catch {
    return "varejo";
  }
}

function getLinePrice(item: any) {
  const p = item?.product ?? {};
  const price = Number(p.employee_price ?? p.price ?? 0);
  const qty = Number(item?.quantity ?? 0);
  return price * qty;
}

const CartToggle: React.FC = () => {
  const { cartItems, totalWeight, animateCartIcon, openCart } = useCart() as any;
  const [pricingTick, setPricingTick] = useState(0);

  const count = useMemo(
    () =>
      (cartItems ?? []).reduce(
        (acc: number, it: any) => acc + (Number(it?.quantity ?? 0) || 0),
        0
      ),
    [cartItems]
  );

  const total = useMemo(
    () => (cartItems ?? []).reduce((acc: number, it: any) => acc + getLinePrice(it), 0),
    [cartItems]
  );

  const progress = useMemo(() => {
    const weight = Number(totalWeight ?? 0);
    if (!Number.isFinite(weight) || weight <= 0) return 0;
    return Math.min((weight / WHOLESALE_WEIGHT_THRESHOLD_KG) * 100, 100);
  }, [totalWeight]);

  void pricingTick;
  const currentChannel = getPricingChannel();
  const reachedWholesale = currentChannel === "atacado";

  const [bump, setBump] = useState(false);
  const bumpTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!animateCartIcon) return;

    setBump(false);

    const frame = window.requestAnimationFrame(() => {
      setBump(true);
      if (bumpTimeoutRef.current) window.clearTimeout(bumpTimeoutRef.current);
      bumpTimeoutRef.current = window.setTimeout(() => {
        setBump(false);
        bumpTimeoutRef.current = null;
      }, 420);
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [animateCartIcon]);

  useEffect(() => {
    return () => {
      if (bumpTimeoutRef.current) window.clearTimeout(bumpTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const onPricing = () => setPricingTick((prev) => prev + 1);
    const onStorage = (e: StorageEvent) => {
      if (e.key === "pricing_context") onPricing();
    };

    window.addEventListener("pricing_context_changed" as any, onPricing);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("pricing_context_changed" as any, onPricing);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  if (!count) return null;

  return (
    <>
      <style>{`
        @keyframes gmCartBump {
          0%   { transform: translateY(0) scale(1); }
          35%  { transform: translateY(-4px) scale(1.05); }
          70%  { transform: translateY(0) scale(1.02); }
          100% { transform: translateY(0) scale(1); }
        }

        @keyframes gmWholesaleGlow {
          0% { transform: translateX(-120%); opacity: 0; }
          18% { opacity: .28; }
          55% { opacity: .1; }
          100% { transform: translateX(140%); opacity: 0; }
        }
      `}</style>

      <div
        className="
          fixed z-[80]
          bottom-4 sm:bottom-7 left-1/2 -translate-x-1/2
          w-[min(750px,calc(100%-20px))] sm:w-[min(750px,calc(100%-36px))]
          flex flex-col gap-3
        "
      >
        <div
          className="
            relative overflow-hidden
            rounded-[18px] sm:rounded-[20px]
            border border-white/70
            bg-white/58
            px-4 py-2.5 sm:px-5 sm:py-3
            backdrop-blur-xl
          "
          style={{
            boxShadow: `
              0 18px 36px rgba(0,0,0,0.10),
              inset 0 1px 0 rgba(255,255,255,0.9),
              0 8px 18px rgba(0,0,0,0.04)
            `,
          }}
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-70"
            style={{
              background: reachedWholesale
                ? "radial-gradient(circle at top right, rgba(34,197,94,0.08), transparent 40%)"
                : "radial-gradient(circle at top right, rgba(255,255,255,0.65), transparent 40%)",
            }}
          />

          <div className="relative flex items-center justify-between gap-3">
            <div className="min-w-0 text-[18px] sm:text-[20px] font-black tracking-[-0.03em] text-gray-900 leading-none">
              {Number(totalWeight || 0).toFixed(1).replace(".", ",")}
              <span className="mx-1.5 text-gray-400">/</span>
              {WHOLESALE_WEIGHT_THRESHOLD_KG.toFixed(0)}
              <span className="ml-1 text-[11px] sm:text-[12px] font-bold text-gray-500">kg</span>
            </div>

            <div className="shrink-0">
              <div
                className={`rounded-full px-2.5 py-1 text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.08em] ${
                  reachedWholesale
                    ? "bg-emerald-100/80 text-emerald-800 ring-1 ring-emerald-200/80"
                    : "bg-white/70 text-gray-500 ring-1 ring-black/5"
                }`}
              >
                {reachedWholesale ? "Atacado" : `${Math.round(progress)}%`}
              </div>
            </div>
          </div>

          <div className="mt-2">
            <div className="relative h-2 sm:h-2.5 overflow-hidden rounded-full bg-[rgba(255,255,255,0.65)] ring-1 ring-black/6">
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-out"
                style={{
                  width: `${progress}%`,
                  background: reachedWholesale
                    ? "linear-gradient(90deg, #187468 0%, #26a97c 58%, #8ee2bf 100%)"
                    : "linear-gradient(90deg, #9e0f14 0%, #cb4155 52%, #efb788 100%)",
                  boxShadow: reachedWholesale
                    ? "0 0 12px rgba(38,169,124,0.2)"
                    : "0 0 12px rgba(158,15,20,0.18)",
                }}
              />
              <div
                className="absolute inset-y-0 w-[32%] rounded-full"
                style={{
                  left: 0,
                  animation: "gmWholesaleGlow 3.4s ease-in-out infinite",
                  background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.45), transparent)",
                }}
              />
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => openCart()}
          className="
            w-full
          rounded-[22px] sm:rounded-[28px]
          bg-white
          border border-gray-200
          px-4 py-4 sm:px-9 sm:py-7
          flex items-center justify-between
          active:scale-[0.992]
          touch-manipulation
        "
        style={{
          animation: bump ? "gmCartBump 420ms ease-out" : undefined,
          boxShadow: `
            0 30px 80px rgba(0,0,0,0.28),
            0 15px 35px rgba(0,0,0,0.22),
            0 0 0 1px rgba(0,0,0,0.04),
            0 0 40px rgba(158,15,20,0.15)
          `,
          backdropFilter: "blur(2px)",
        }}
        aria-label="Abrir sua sacola"
      >
        <div className="flex items-center gap-3 sm:gap-6 min-w-0">
          <div className="h-12 w-12 sm:h-[72px] sm:w-[72px] rounded-2xl sm:rounded-3xl bg-black text-white flex items-center justify-center shrink-0">
            <ShoppingBag className="h-6 w-6 sm:h-9 sm:w-9" />
          </div>

          <div className="min-w-0 text-left">
            <div className="text-[16px] sm:text-[24px] font-extrabold text-gray-900 leading-tight">
              Sua sacola
            </div>
            <div className="text-[12px] sm:text-[18px] text-gray-500 font-semibold">
              {count} item{count > 1 ? "s" : ""}
            </div>
          </div>
        </div>

        <div className="text-right">
          <div className="text-[18px] sm:text-[30px] font-extrabold text-gray-900 leading-none">
            {total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          </div>
          <div className="text-[11px] sm:text-[16px] text-gray-500 font-semibold mt-1 sm:mt-2">
            Toque para abrir
          </div>
        </div>
        </button>
      </div>
    </>
  );
};

export default CartToggle;
