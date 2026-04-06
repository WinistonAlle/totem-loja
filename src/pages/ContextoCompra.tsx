// src/pages/ContextoCompra.tsx
import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import styled from "styled-components";
import { Bg } from "@/components/ui/app-surface";
import logo from "@/images/logoc.png";
import { ArrowLeft } from "lucide-react";

/* ================= TYPES ================= */

type ChannelType = "varejo" | "atacado";

/* ================= STYLES ================= */

const Screen = styled(Bg)`
  height: 100dvh;
  width: 100%;
  overflow: hidden;

  /* ✅ modo totem: sem scroll/bounce */
  overscroll-behavior: none;
  touch-action: none; /* bloqueia pan/zoom */
  -webkit-user-select: none;
  user-select: none;

  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;

  background: linear-gradient(135deg, #b82626 0%, #9e0f14 60%, #7f0b10 100%);
`;

const TopBar = styled.div`
  position: absolute;
  top: 30px;
  left: 30px;

  @media (max-width: 640px) {
    top: max(14px, env(safe-area-inset-top));
    left: 14px;
  }
`;

const BackBtn = styled.button`
  height: 50px;
  padding: 0 16px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: rgba(0, 0, 0, 0.15);
  color: white;
  font-weight: 900;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;

  &:active {
    transform: scale(0.98);
  }

  @media (max-width: 640px) {
    height: 44px;
    padding: 0 14px;
    border-radius: 14px;
    font-size: 14px;
  }
`;

const Logo = styled.img`
  position: absolute;
  top: 28px;
  left: 50%;
  transform: translateX(-50%);
  height: 46px;

  @media (max-width: 640px) {
    top: max(16px, env(safe-area-inset-top));
    height: 34px;
  }
`;

const Content = styled.div`
  width: min(900px, 90vw);
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 60px;

  @media (max-width: 640px) {
    width: min(520px, calc(100vw - 32px));
    gap: 24px;
    margin-top: 52px;
  }
`;

const Question = styled.h1`
  font-size: clamp(28px, 4vw, 46px);
  font-weight: 1000;
  color: white;
  margin: 0;

  @media (max-width: 640px) {
    font-size: clamp(24px, 7vw, 34px);
    line-height: 1.08;
  }
`;

const Options = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 24px;

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
    gap: 14px;
  }
`;

const OptionBtn = styled.button`
  height: 140px;
  border-radius: 26px;
  border: 0;
  cursor: pointer;

  font-size: clamp(22px, 3vw, 34px);
  font-weight: 1000;
  letter-spacing: -0.01em;

  background: white;
  color: #9e0f14;

  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
  transition: transform 120ms ease;

  &:active {
    transform: scale(0.97);
  }

  @media (max-width: 640px) {
    height: 92px;
    border-radius: 22px;
    font-size: clamp(22px, 6vw, 28px);
    box-shadow: 0 14px 32px rgba(0, 0, 0, 0.22);
  }
`;

/* ================= PAGE ================= */

export default function ContextoCompra() {
  const navigate = useNavigate();

  // ✅ trava scroll do documento inteiro (iOS/Android/Safari)
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;

    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyHeight = body.style.height;
    const prevBodyPosition = body.style.position;
    const prevBodyWidth = body.style.width;
    const prevBodyTouchAction = (body.style as any).touchAction;

    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.height = "100dvh";
    body.style.position = "fixed";
    body.style.width = "100%";
    (body.style as any).touchAction = "none";

    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      body.style.height = prevBodyHeight;
      body.style.position = prevBodyPosition;
      body.style.width = prevBodyWidth;
      (body.style as any).touchAction = prevBodyTouchAction;
    };
  }, []);

  function handleChannel(channel: ChannelType) {
    const customerType = channel === "atacado" ? "cnpj" : "cpf";
    const ctx = {
      customer_type: customerType,
      channel,
      price_table: `${channel.toUpperCase()}_${customerType.toUpperCase()}`,
      created_at: new Date().toISOString(),
    };

    localStorage.setItem("pricing_context", JSON.stringify(ctx));
    window.dispatchEvent(new Event("pricing_context_changed"));
    navigate("/catalogo");
  }

  return (
    <>
      <Screen>
        <TopBar>
          <BackBtn
            data-testid="context-back"
            onClick={() => {
              localStorage.removeItem("pricing_context");
              window.dispatchEvent(new Event("pricing_context_changed"));
              navigate("/inicio");
            }}
          >
            <ArrowLeft size={18} />
            Voltar
          </BackBtn>
        </TopBar>

        <Logo src={logo} alt="Gostinho Mineiro" />

        <Content>
          <>
            <Question>Escolha o tipo de compra</Question>

            <Options>
              <OptionBtn
                data-testid="context-channel-varejo"
                aria-label="Selecionar varejo"
                onClick={() => handleChannel("varejo")}
              >
                VAREJO
              </OptionBtn>
              <OptionBtn
                data-testid="context-channel-atacado"
                aria-label="Selecionar atacado"
                onClick={() => handleChannel("atacado")}
              >
                ATACADO
              </OptionBtn>
            </Options>
          </>
        </Content>
      </Screen>
    </>
  );
}
