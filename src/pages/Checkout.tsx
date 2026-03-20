// src/pages/Checkout.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useCart } from "@/contexts/CartContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import { useNavigate } from "react-router-dom";
import { createOrder } from "@/services/orders";

import logo from "../images/logoc.png";

/* --------------------------------------------------------
   SESSION HELPERS
-------------------------------------------------------- */
function clearCustomerSession() {
  localStorage.removeItem("customer_session");
  localStorage.removeItem("pricing_context");
  window.dispatchEvent(new Event("customer_session_changed"));
  window.dispatchEvent(new Event("pricing_context_changed"));
}

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

function formatBRLFromCents(cents: number) {
  const v = (Number.isFinite(cents) ? cents : 0) / 100;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// tenta usar preço de cliente/varejo se existir, e só cai no employee_price como fallback
function getUnitPrice(product: any): number {
  const candidates = [
    product?.customer_price,
    product?.retail_price,
    product?.price,
    product?.unit_price,
    product?.employee_price,
  ];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

/* --------------------------------------------------------
   SUCCESS OVERLAY (com "obrigado" animado)
-------------------------------------------------------- */
function SuccessOverlay({
  open,
  title,
  subtitle,
  countdownSec,
  onGoStartNow,
}: {
  open: boolean;
  title: string;
  subtitle: string;
  countdownSec: number;
  onGoStartNow: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center px-4 sm:px-6">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" />

      <div className="relative w-full max-w-[650px] rounded-[26px] sm:rounded-[35px] bg-white border shadow-2xl p-5 sm:p-[35px] overflow-hidden">
        <div className="absolute -top-16 -right-16 h-[180px] w-[180px] sm:-top-20 sm:-right-20 sm:h-[280px] sm:w-[280px] rounded-full bg-emerald-100/70" />
        <div className="absolute -bottom-[70px] -left-16 h-56 w-56 sm:-bottom-[100px] sm:-left-20 sm:h-80 sm:w-80 rounded-full bg-emerald-50" />

        <div className="relative">
          <div className="mx-auto mb-5 sm:mb-6 h-[78px] w-[78px] sm:h-[100px] sm:w-[100px] rounded-[24px] sm:rounded-[30px] bg-emerald-50 border flex items-center justify-center success-pop">
            <svg width="55" height="55" viewBox="0 0 24 24" aria-hidden>
              <path
                d="M20 6L9 17l-5-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="success-check"
              />
            </svg>
          </div>

          <h2 className="text-[24px] sm:text-[30px] font-extrabold text-center success-fade">{title}</h2>
          <p className="mt-3 sm:mt-4 text-base sm:text-xl text-gray-700 text-center success-fade">{subtitle}</p>

          <p className="mt-5 sm:mt-6 text-center text-[18px] sm:text-[22px] font-extrabold thank-you">
            Obrigado por comprar conosco <span className="sparkle">✨</span>
          </p>

          <div className="mt-6 sm:mt-8 grid gap-4">
            <Button onClick={onGoStartNow} className="w-full h-14 sm:h-[70px] text-base sm:text-xl font-semibold rounded-[18px] sm:rounded-[20px]">
              Voltar ao início agora
            </Button>

            <p className="text-sm sm:text-[18px] text-gray-600 text-center">
              Reiniciando em <span className="font-semibold">{countdownSec}s</span>…
            </p>
          </div>

          <p className="mt-4 sm:mt-5 text-[13px] sm:text-[15px] text-gray-500 text-center">
            Mostre seu pedido no balcão para finalizar com o atendimento.
          </p>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------
   PAGE
-------------------------------------------------------- */
const Checkout: React.FC = () => {
  const { cartItems, cartTotal, clearCart } = useCart();
  const navigate = useNavigate();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [customerName, setCustomerName] = useState("");

  const safeCartTotal = Number.isFinite(cartTotal) ? cartTotal : 0;
  const totalCents = useMemo(() => Math.round(safeCartTotal * 100), [safeCartTotal]);

  const [successOpen, setSuccessOpen] = useState(false);
  const [successTitle, setSuccessTitle] = useState("Pedido enviado!");
  const [successSubtitle, setSuccessSubtitle] = useState("Finalize no balcão para revisar e pagar.");

  const SUCCESS_SECONDS = 7;
  const [countdownSec, setCountdownSec] = useState(SUCCESS_SECONDS);

  const goStartWithLogout = () => {
    clearCart();
    clearCustomerSession();
    navigate("/inicio", { replace: true });
  };

  useEffect(() => {
    if (!successOpen) return;

    setCountdownSec(SUCCESS_SECONDS);

    const t1 = window.setInterval(() => {
      setCountdownSec((s) => (s <= 1 ? 1 : s - 1));
    }, 1000);

    const t2 = window.setTimeout(() => {
      goStartWithLogout();
    }, SUCCESS_SECONDS * 1000);

    return () => {
      window.clearInterval(t1);
      window.clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [successOpen]);

  const handleConfirm = async () => {
    if (cartItems.length === 0) {
      toast.error("Carrinho vazio!", { description: "Não é possível confirmar um pedido vazio." });
      return;
    }

    setIsSubmitting(true);

    try {
      const trimmedCustomerName = customerName.trim();
      const pricingChannel = getPricingChannel();

      if (!trimmedCustomerName) {
        toast.error("Digite seu nome", {
          description: "Precisamos do seu nome para identificar o pedido no balcão.",
        });
        setIsSubmitting(false);
        return;
      }

      const { orderId, orderNumber } = await createOrder({
        customerId: null,
        customerDocument: "TOTEM-CONSUMIDOR",
        customerName: trimmedCustomerName,
        paymentMethod: `attendant_${pricingChannel}`,
        payOnPickupCents: totalCents,
        items: cartItems.map((ci) => ({ product: ci.product, quantity: ci.quantity })),
      });

      if (!orderId) throw new Error("Falha ao criar pedido (orderId vazio).");

      setSuccessTitle("Pedido enviado!");
      setSuccessSubtitle(`Pedido ${orderNumber ?? `#${orderId}`} enviado. Vá ao balcão para revisar e pagar.`);
      setSuccessOpen(true);

      toast.success("Pedido enviado!", {
        description: `Total: ${formatBRLFromCents(totalCents)} • Finalize no atendimento.`,
      });
    } catch (err: any) {
      console.error("Erro ao finalizar pedido:", err);
      toast.error("Erro ao finalizar pedido", {
        description:
          err?.message ||
          err?.hint ||
          err?.details ||
          "Ocorreu um erro inesperado. Veja o console para mais detalhes.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (cartItems.length === 0) {
    return (
      <div className="min-h-[100dvh] w-full flex items-center justify-center px-4 sm:px-6 bg-gradient-to-b from-white via-zinc-50 to-zinc-100">
        <div className="w-full max-w-[650px] rounded-[26px] sm:rounded-[35px] bg-white border shadow-xl p-6 sm:p-10 text-center animate-in">
          <img src={logo} alt="Logo" className="mx-auto mb-5 sm:mb-6 h-14 sm:h-20 w-auto select-none" />
          <h1 className="text-[24px] sm:text-[30px] font-extrabold mb-3">Carrinho vazio</h1>
          <p className="text-base sm:text-xl text-gray-700 mb-7 sm:mb-8">Volte ao catálogo para adicionar itens.</p>

          <div className="grid gap-4">
            <Button className="h-14 sm:h-[70px] text-base sm:text-xl font-semibold rounded-[18px] sm:rounded-[20px]" onClick={() => navigate("/catalogo")}>
              Voltar para o catálogo
            </Button>
            <Button
              variant="outline"
              className="h-14 sm:h-[70px] text-base sm:text-xl font-semibold rounded-[18px] sm:rounded-[20px]"
              onClick={() => navigate("/inicio", { replace: true })}
            >
              Ir para o início
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] w-full" style={{ overscrollBehavior: "none", touchAction: "pan-y" }}>
      <style>{`
        html, body, #root { height: 100%; }
        body { margin: 0; }

        @keyframes cardIn {
          0% { transform: translateY(14px) scale(0.98); opacity: 0; }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
        .animate-in { animation: cardIn 420ms cubic-bezier(.2,.9,.2,1) both; }

        @keyframes floaty {
          0% { transform: translateY(0px) translateX(0px) scale(1); }
          50% { transform: translateY(-10px) translateX(8px) scale(1.02); }
          100% { transform: translateY(0px) translateX(0px) scale(1); }
        }
        .blob { animation: floaty 8s ease-in-out infinite; }

        @keyframes pop {
          0% { transform: scale(0.86); opacity: 0; }
          60% { transform: scale(1.05); opacity: 1; }
          100% { transform: scale(1); }
        }
        @keyframes fadeUp {
          0% { transform: translateY(10px); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
        @keyframes draw {
          0% { stroke-dashoffset: 40; opacity: 0.6; }
          100% { stroke-dashoffset: 0; opacity: 1; }
        }
        .success-pop { animation: pop 420ms ease-out both; }
        .success-fade { animation: fadeUp 420ms ease-out both; animation-delay: 90ms; }
        .success-check {
          stroke-dasharray: 40;
          stroke-dashoffset: 40;
          animation: draw 560ms ease-out both;
          animation-delay: 140ms;
          color: #059669;
        }

        @keyframes thank {
          0% { transform: translateY(6px); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
        @keyframes sparkle {
          0%, 100% { transform: translateY(0) rotate(0deg); opacity: .9; }
          50% { transform: translateY(-3px) rotate(10deg); opacity: 1; }
        }
        .thank-you { animation: thank 520ms ease-out both; animation-delay: 120ms; }
        .sparkle { display: inline-block; animation: sparkle 1.2s ease-in-out infinite; }

        .totem-primary {
          height: 64px;
          width: 100%;
          border-radius: 18px;
          font-weight: 900;
          font-size: 17px;
          box-shadow: 0 14px 28px rgba(0,0,0,0.14);
          position: relative;
          overflow: hidden;
        }
        .totem-outline {
          height: 64px;
          width: 100%;
          border-radius: 18px;
          font-weight: 900;
          font-size: 17px;
        }

        @media (min-width: 640px) {
          .totem-primary {
            height: 80px;
            border-radius: 23px;
            font-size: 23px;
          }
          .totem-outline {
            height: 80px;
            border-radius: 23px;
            font-size: 23px;
          }
        }

        @keyframes shine {
          0% { transform: translateX(-120%) skewX(-18deg); opacity: 0; }
          20% { opacity: .35; }
          45% { transform: translateX(120%) skewX(-18deg); opacity: 0; }
          100% { opacity: 0; }
        }
        .shine::after {
          content: "";
          position: absolute;
          inset: 0;
          width: 55%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.55), transparent);
          transform: translateX(-120%) skewX(-18deg);
          animation: shine 3.2s ease-in-out infinite;
          pointer-events: none;
        }

        .stickyBar {
          position: sticky;
          bottom: 0;
          z-index: 20;
          background: rgba(255,255,255,.78);
          backdrop-filter: blur(10px);
          border-top: 1px solid rgba(0,0,0,.06);
        }

        .niceScroll { scrollbar-width: thin; }
      `}</style>

      <div className="relative min-h-[100dvh] w-full bg-gradient-to-b from-white via-zinc-50 to-zinc-100 px-4 sm:px-5 py-5 sm:py-[30px] flex items-center justify-center">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="blob absolute -top-20 -left-[100px] h-80 w-80 rounded-full bg-zinc-200/50 blur-2xl" />
          <div
            className="blob absolute top-[200px] -right-[100px] h-[360px] w-[360px] rounded-full bg-zinc-200/40 blur-2xl"
            style={{ animationDelay: "1.2s" }}
          />
          <div
            className="blob absolute bottom-[50px] left-[50px] h-[280px] w-[280px] rounded-full bg-zinc-300/35 blur-2xl"
            style={{ animationDelay: "2.1s" }}
          />
        </div>

        <SuccessOverlay
          open={successOpen}
          title={successTitle}
          subtitle={successSubtitle}
          countdownSec={countdownSec}
          onGoStartNow={goStartWithLogout}
        />

        <div className="relative mx-auto w-full max-w-[700px] rounded-[26px] sm:rounded-[38px] bg-white border shadow-xl animate-in overflow-hidden">
          <div className="px-4 sm:px-8 pt-5 sm:pt-8 pb-4 sm:pb-5 border-b bg-white">
            <div className="flex items-center gap-3 sm:gap-4">
              <img src={logo} alt="Logo" className="h-[42px] sm:h-[60px] w-auto select-none" />
              <div className="min-w-0">
                <p className="text-[12px] sm:text-[15px] text-gray-500 font-semibold">Autoatendimento</p>
                <h1 className="text-[20px] sm:text-[25px] font-extrabold leading-tight">Revisão do pedido</h1>
              </div>
            </div>

            <div className="mt-4 sm:mt-5 rounded-[18px] sm:rounded-[20px] bg-zinc-50 border px-4 sm:px-5 py-3 sm:py-[15px] flex items-center justify-between gap-4">
              <span className="text-[15px] sm:text-[18px] text-gray-600 font-semibold">Total</span>
              <span className="text-[24px] sm:text-[30px] font-black text-right">{formatBRLFromCents(totalCents)}</span>
            </div>
          </div>

          <div className="px-4 sm:px-8 pt-4 sm:pt-6 pb-3">
            <div className="mb-4 rounded-[22px] sm:rounded-[28px] border bg-white overflow-hidden">
              <div className="px-4 sm:px-5 py-3 sm:py-[15px] border-b bg-white">
                <p className="text-lg sm:text-xl font-extrabold">Identificação do pedido</p>
                <p className="mt-1 text-[14px] sm:text-[16px] text-gray-600">
                  O pedido vai para o cliente fixo CONSUMIDOR. Digite apenas seu nome para a atendente localizar.
                </p>
              </div>

              <div className="px-4 sm:px-5 py-4 sm:py-5 space-y-4">
                <div className="space-y-2">
                  <label htmlFor="customer-name" className="block text-[15px] sm:text-[17px] font-extrabold text-gray-900">
                    Seu nome
                  </label>
                  <Input
                    id="customer-name"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Ex.: Joao Silva"
                    maxLength={80}
                    className="h-14 sm:h-16 rounded-[16px] sm:rounded-[18px] text-[18px] sm:text-[22px] font-semibold"
                    disabled={isSubmitting || successOpen}
                  />
                </div>

                <div className="rounded-[16px] sm:rounded-[20px] bg-zinc-50 border px-4 sm:px-5 py-3 sm:py-4 flex items-center justify-between gap-3">
                  <span className="text-[14px] sm:text-[16px] font-semibold text-gray-600">Preço aplicado</span>
                  <span className="text-[16px] sm:text-[18px] font-black uppercase">
                    {getPricingChannel()}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-[22px] sm:rounded-[28px] border bg-white overflow-hidden">
              <div className="px-4 sm:px-5 py-3 sm:py-[15px] border-b bg-white flex items-center justify-between gap-3">
                <p className="text-lg sm:text-xl font-extrabold">Itens</p>
                <p className="text-[15px] sm:text-[18px] text-gray-600">
                  {cartItems.length} {cartItems.length === 1 ? "item" : "itens"}
                </p>
              </div>

              <div className="niceScroll px-4 sm:px-5 py-4 sm:py-5 space-y-3 sm:space-y-4 max-h-[42vh] overflow-auto">
                {cartItems.map((item) => {
                  const unit = getUnitPrice(item.product);
                  const line = unit * item.quantity;

                  return (
                    <div
                      key={item.product.id}
                      className="rounded-[16px] sm:rounded-[20px] bg-zinc-50 border px-4 sm:px-5 py-3 sm:py-[15px] flex items-start sm:items-center justify-between gap-3 sm:gap-5"
                    >
                      <div className="min-w-0">
                        <p className="font-extrabold text-base sm:text-xl leading-tight sm:truncate">{item.product.name}</p>
                        <p className="text-[14px] sm:text-[18px] text-gray-700 mt-1 sm:mt-0">
                          {item.quantity} ×{" "}
                          {Number(unit).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                        </p>
                      </div>

                      <p className="font-black text-base sm:text-xl whitespace-nowrap self-center">
                        {Number(line).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="stickyBar px-4 sm:px-8 py-4 sm:py-5">
            <div className="grid gap-4">
              <Button
                variant="outline"
                className="totem-outline"
                onClick={() => navigate("/catalogo")}
                disabled={isSubmitting || successOpen}
              >
                Voltar ao catálogo
              </Button>

              <Button
                className={`totem-primary shine`}
                onClick={handleConfirm}
                disabled={isSubmitting || successOpen}
                aria-busy={isSubmitting ? "true" : "false"}
              >
                {isSubmitting ? "Enviando..." : "Confirmar pedido"}
              </Button>

              <p className="text-[15px] text-gray-600 text-center">
                Após enviar, você será direcionado para o início.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Checkout;
