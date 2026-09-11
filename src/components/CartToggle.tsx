// src/components/CartToggle.tsx
import React, { useEffect, useRef, useState } from "react";
import { ShoppingBag } from "lucide-react";
import { useCart } from "../contexts/CartContext";
import { getProductUnitPrice } from "@/utils/productData";

function getLinePrice(item: any) {
  const p = item?.product ?? {};
  const price = getProductUnitPrice(p);
  const qty = Number(item?.quantity ?? 0);
  return price * qty;
}

const CartToggle: React.FC = () => {
  const { cartItems, animateCartIcon, openCart } = useCart() as any;

  const count = (cartItems ?? []).reduce(
    (acc: number, it: any) => acc + (Number(it?.quantity ?? 0) || 0),
    0
  );

  const total = (cartItems ?? []).reduce((acc: number, it: any) => acc + getLinePrice(it), 0);

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
      `}</style>

      <div
        className="
          fixed z-[80]
          bottom-4 sm:bottom-7 left-1/2 -translate-x-1/2
          w-[min(750px,calc(100%-20px))] sm:w-[min(750px,calc(100%-36px))]
          flex flex-col gap-3
        "
      >
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
