// src/components/Cart.tsx
import React, { useEffect, useMemo, useState } from "react";
import { X, Minus, Plus, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useCart } from "../contexts/CartContext";
import { Button } from "./ui/button";
import { toast } from "./ui/sonner";
import { getPricingChannel, updatePricingChannel } from "@/utils/pricingContext";
import { WHOLESALE_WEIGHT_THRESHOLD_KG, hasWholesaleAccess } from "@/utils/wholesaleRules";

function getLinePrice(item: any) {
  const p = item?.product ?? {};
  const price = Number(p.employee_price ?? p.price ?? 0);
  const qty = Number(item?.quantity ?? 0);
  return price * qty;
}

const Cart: React.FC = () => {
  const navigate = useNavigate();
  const { cartItems, totalWeight, addToCart, decreaseQuantity, removeFromCart, isCartOpen, openCart, closeCart } =
    useCart() as any;
  const [enter, setEnter] = useState(false);
  const [showWholesaleBlockCard, setShowWholesaleBlockCard] = useState(false);
  const pricingChannel = getPricingChannel();
  const wholesaleUnlocked = hasWholesaleAccess(totalWeight);
  const canProceedToCheckout = pricingChannel !== "atacado" || wholesaleUnlocked;

  useEffect(() => {
    const onOpen = () => openCart();
    window.addEventListener("gm:open-cart", onOpen as any);
    return () => window.removeEventListener("gm:open-cart", onOpen as any);
  }, [openCart]);

  useEffect(() => {
    if (!isCartOpen) {
      setEnter(false);
      setShowWholesaleBlockCard(false);
      return;
    }
    const raf = requestAnimationFrame(() => setEnter(true));
    return () => cancelAnimationFrame(raf);
  }, [isCartOpen]);

  useEffect(() => {
    if (canProceedToCheckout && showWholesaleBlockCard) {
      setShowWholesaleBlockCard(false);
    }
  }, [canProceedToCheckout, showWholesaleBlockCard]);

  const total = useMemo(
    () => (cartItems ?? []).reduce((acc: number, it: any) => acc + getLinePrice(it), 0),
    [cartItems]
  );

  const close = () => closeCart();

  const handleProceedToCheckout = () => {
    if (!canProceedToCheckout) {
      setShowWholesaleBlockCard(true);
      return;
    }

    close();
    navigate("/checkout");
  };

  const handleSwitchToRetailCheckout = () => {
    updatePricingChannel("varejo");
    setShowWholesaleBlockCard(false);
    toast.success("Tabela alterada para varejo", {
      description: "Agora você pode continuar para o checkout.",
    });
  };

  if (!isCartOpen) return null;

  return (
    <>
      <div
        className={`fixed inset-0 z-[90] bg-black/45 backdrop-blur-sm transition-opacity duration-200 ${
          enter ? "opacity-100" : "opacity-0"
        }`}
        onClick={close}
      />

      {showWholesaleBlockCard && !canProceedToCheckout && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center px-5 sm:px-8">
          <button
            type="button"
            className="absolute inset-0 bg-black/30 backdrop-blur-[3px]"
            aria-label="Fechar aviso"
            onClick={() => setShowWholesaleBlockCard(false)}
          />

          <div className="relative w-full max-w-[620px] rounded-[32px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,248,248,0.98)_0%,rgba(255,255,255,0.98)_100%)] px-6 py-6 sm:px-8 sm:py-8 shadow-[0_30px_90px_rgba(0,0,0,0.18)] text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#fff0f1] border border-[#f4c8cb]">
              <span className="text-[22px]">!</span>
            </div>

            <div className="text-[11px] sm:text-[12px] font-extrabold tracking-[0.18em] text-[#9e0f14] uppercase">
              Checkout bloqueado
            </div>

            <div className="mt-3 text-[24px] sm:text-[34px] leading-tight font-extrabold text-gray-950">
              Faltam{" "}
              {Math.max(WHOLESALE_WEIGHT_THRESHOLD_KG - Number(totalWeight ?? 0), 0)
                .toFixed(1)
                .replace(".", ",")}
              kg para liberar o atacado
            </div>

            <div className="mt-3 text-[14px] sm:text-[17px] font-semibold text-gray-600">
              Você pode voltar ao catálogo para adicionar mais itens ou continuar agora com preço de varejo.
            </div>

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Button
                type="button"
                variant="outline"
                className="h-13 sm:h-14 rounded-2xl border-gray-300 bg-white/90 text-[14px] sm:text-[15px] font-extrabold text-gray-900 hover:bg-white"
                onClick={close}
              >
                Voltar ao catálogo
              </Button>
              <Button
                type="button"
                className="h-13 sm:h-14 rounded-2xl bg-black text-[14px] sm:text-[15px] font-extrabold text-white hover:bg-gray-900"
                onClick={handleSwitchToRetailCheckout}
              >
                Continuar com varejo
              </Button>
            </div>

            <button
              type="button"
              className="mt-4 text-[12px] sm:text-[13px] font-semibold text-gray-500 hover:text-gray-700"
              onClick={() => setShowWholesaleBlockCard(false)}
            >
              Fechar aviso
            </button>
          </div>
        </div>
      )}

      {/* Bottom sheet (MOBILE: quase full / TOTEM: mantém 56dvh) */}
      <div
        className={`
          fixed inset-x-0 bottom-0 z-[100]
          w-full bg-white
          border-t border-gray-200
          shadow-[0_-18px_70px_rgba(0,0,0,0.22)]
          overflow-hidden
          rounded-t-[26px] sm:rounded-t-[36px] rounded-b-none
          transform transition-transform duration-300 ease-out
          ${enter ? "translate-y-0" : "translate-y-[110%]"}
          flex flex-col

          h-[88dvh] sm:h-[56dvh]
        `}
        role="dialog"
        aria-label="Sua sacola"
        data-testid="cart-sheet"
      >
        {/* Header (MOBILE mais compacto) */}
        <div className="px-5 py-4 sm:px-8 sm:py-6 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <div className="text-[20px] sm:text-[30px] leading-tight font-extrabold text-gray-900">
              Sua sacola
            </div>
            <div className="text-[13px] sm:text-[16px] text-gray-500 font-semibold mt-1">
              Revise e finalize com a atendente
            </div>
          </div>

          <button
            onClick={close}
            data-testid="cart-close"
            className="
              h-11 w-11 sm:h-14 sm:w-14
              rounded-2xl sm:rounded-3xl
              border border-gray-200 bg-white
              hover:bg-gray-50 active:scale-[0.99]
              shrink-0
            "
            aria-label="Fechar sacola"
          >
            <X className="h-6 w-6 sm:h-7 sm:w-7 mx-auto text-gray-700" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-auto px-5 py-4 sm:px-8 sm:py-6">
          {!cartItems?.length ? (
            <div className="text-gray-500 font-semibold text-[16px] sm:text-[18px]">
              Sua sacola está vazia.
            </div>
          ) : (
            <div className="flex flex-col gap-4 sm:gap-5">
              {cartItems.map((it: any) => {
                const p = it.product;
                const qty = Number(it.quantity || 0);
                const price = Number(p.employee_price ?? p.price ?? 0);
                const line = price * qty;

                return (
                  <div
                    key={String(p.id)}
                    className="
                      rounded-[22px] sm:rounded-[28px]
                      border border-gray-200 bg-white
                      p-4 sm:p-6
                    "
                  >
                    {/* TOTEM: linha horizontal grande (igual antes) */}
                    <div className="hidden sm:flex items-center gap-6">
                      <div className="h-24 w-24 rounded-3xl bg-gray-100 overflow-hidden border border-gray-200 shrink-0">
                        {p?.images?.length ? (
                          <img src={p.images[0]} alt={p.name} className="h-full w-full object-cover" />
                        ) : p?.image_path ? (
                          <img src={p.image_path} alt={p.name} className="h-full w-full object-cover" />
                        ) : null}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="font-extrabold text-gray-900 line-clamp-2 text-[22px] leading-snug">
                          {p.name}
                        </div>
                        <div className="text-[18px] text-gray-500 font-semibold mt-2">
                          {price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <Button
                          variant="outline"
                          className="h-16 w-16 rounded-3xl"
                          onClick={() => decreaseQuantity(p.id)}
                        >
                          <Minus className="h-8 w-8" />
                        </Button>

                        <div className="w-16 text-center font-extrabold text-gray-900 text-[22px]">
                          {qty}
                        </div>

                        <Button
                          variant="outline"
                          className="h-16 w-16 rounded-3xl"
                          onClick={() => addToCart(p)}
                        >
                          <Plus className="h-8 w-8" />
                        </Button>

                        <Button
                          variant="outline"
                          className="h-16 w-16 rounded-3xl"
                          onClick={() => removeFromCart?.(p.id)}
                          aria-label="Remover item"
                        >
                          <Trash2 className="h-8 w-8" />
                        </Button>
                      </div>

                      <div className="w-[180px] text-right font-extrabold text-gray-900 text-[22px]">
                        {line.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      </div>
                    </div>

                    {/* MOBILE: layout vertical compacto */}
                    <div className="sm:hidden">
                      <div className="flex gap-3">
                        <div className="h-16 w-16 rounded-2xl bg-gray-100 overflow-hidden border border-gray-200 shrink-0">
                          {p?.images?.length ? (
                            <img src={p.images[0]} alt={p.name} className="h-full w-full object-cover" />
                          ) : p?.image_path ? (
                            <img src={p.image_path} alt={p.name} className="h-full w-full object-cover" />
                          ) : null}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="font-extrabold text-gray-900 line-clamp-2 text-[15px] leading-snug">
                            {p.name}
                          </div>

                          <div className="mt-1 text-[13px] text-gray-500 font-semibold">
                            {price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                          </div>

                          <div className="mt-2 text-[14px] font-extrabold text-gray-900">
                            {line.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                          </div>
                        </div>

                        <Button
                          variant="outline"
                          className="h-11 w-11 rounded-2xl shrink-0"
                          onClick={() => removeFromCart?.(p.id)}
                          aria-label="Remover item"
                        >
                          <Trash2 className="h-5 w-5" />
                        </Button>
                      </div>

                      <div className="mt-3 flex items-center justify-between">
                        <div className="inline-flex items-center rounded-2xl border border-gray-200 overflow-hidden bg-white shadow-sm">
                          <button
                            type="button"
                            className="h-11 w-11 grid place-items-center active:bg-gray-50"
                            onClick={() => decreaseQuantity(p.id)}
                            aria-label="Diminuir"
                          >
                            <Minus className="h-5 w-5 text-gray-900" />
                          </button>

                          <div className="h-11 w-12 grid place-items-center">
                            <span className="text-[16px] font-extrabold text-gray-900">{qty}</span>
                          </div>

                          <button
                            type="button"
                            className="h-11 w-11 grid place-items-center active:bg-gray-50"
                            onClick={() => addToCart(p)}
                            aria-label="Aumentar"
                          >
                            <Plus className="h-5 w-5 text-gray-900" />
                          </button>
                        </div>

                        <div className="text-[12px] text-gray-500 font-semibold">
                          Toque para ajustar
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer fixo (MOBILE: sticky) */}
        <div className="px-5 py-4 sm:px-8 sm:py-6 border-t border-gray-100 bg-white shrink-0">
          <div className="flex items-center justify-between mb-4 sm:mb-5">
            <div className="text-[14px] sm:text-[18px] font-semibold text-gray-500">Total</div>
            <div className="text-[24px] sm:text-[34px] leading-none font-extrabold text-gray-900">
              {total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </div>
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            <Button
              variant="outline"
              data-testid="cart-continue"
              className="h-12 sm:h-16 rounded-2xl sm:rounded-3xl px-5 sm:px-8 font-extrabold text-[14px] sm:text-[18px]"
              onClick={close}
            >
              Continuar
            </Button>

            <Button
              data-testid="cart-finalize"
              className="h-12 sm:h-16 rounded-2xl sm:rounded-3xl px-6 sm:px-9 font-extrabold text-[14px] sm:text-[18px] bg-black text-white hover:bg-gray-900 flex-1"
              onClick={handleProceedToCheckout}
            >
              Finalizar
            </Button>
          </div>

          <div className="mt-2 sm:hidden text-[12px] font-semibold text-gray-500">
            {canProceedToCheckout
              ? "Você finaliza com a atendente na próxima tela"
              : showWholesaleBlockCard
              ? "Escolha voltar ao catálogo ou continuar com varejo"
              : "Você finaliza com a atendente na próxima tela"}
          </div>
        </div>
      </div>
    </>
  );
};

export default Cart;
