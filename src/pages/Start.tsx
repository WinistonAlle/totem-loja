// src/pages/Start.tsx
import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { APP_EVENT, emitAppEvent } from "@/lib/appEvents";
import { clearCustomerSession, saveCustomerSession } from "@/utils/customerSession";
import styled, { keyframes } from "styled-components";
import { Bg } from "@/components/ui/app-surface";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import logoGostinho from "@/images/logoc.png";
import paoImg from "@/images/optimized/pao-hero.png";
import paoDeQueijoImg from "@/images/optimized/paodequeijo-hero.png";
import biscoitoImg from "@/images/optimized/biscoito-hero.png";

/* ---------------- Anim ---------------- */
const pulse = keyframes`
  0%   { transform: scale(1); box-shadow: 0 18px 40px rgba(158,15,20,.28); }
  50%  { transform: scale(1.035); box-shadow: 0 24px 62px rgba(158,15,20,.38); }
  100% { transform: scale(1); box-shadow: 0 18px 40px rgba(158,15,20,.28); }
`;

const sheen = keyframes`
  0% { transform: translateX(-120%) rotate(8deg); opacity: 0; }
  12% { opacity: .22; }
  55% { opacity: .10; }
  100% { transform: translateX(130%) rotate(8deg); opacity: 0; }
`;

const floatInLeft = keyframes`
  0% {
    transform: translate3d(-22%, 18%, 0) rotate(-8deg) scale(1.06);
    opacity: 0;
  }
  18% {
    transform: translate3d(0, 0, 0) rotate(0deg) scale(1);
    opacity: 1;
  }
  58% {
    transform: translate3d(0, -1.8%, 0) rotate(-1.1deg) scale(1.018);
    opacity: 1;
  }
  100% {
    transform: translate3d(0, 0.8%, 0) rotate(0.6deg) scale(0.997);
    opacity: 1;
  }
`;

const floatInCenterDesktop = keyframes`
  0% {
    transform: translate3d(-50%, 24%, 0) scale(1.1);
    opacity: 0;
  }
  18% {
    transform: translate3d(-50%, 0, 0) scale(1);
    opacity: 1;
  }
  58% {
    transform: translate3d(-50%, -1.5%, 0) scale(1.015);
    opacity: 1;
  }
  100% {
    transform: translate3d(-50%, 0.8%, 0) scale(0.996);
    opacity: 1;
  }
`;

const floatInCenterMobile = keyframes`
  0% {
    transform: translate3d(-50%, 30%, 0) scale(1.1);
    opacity: 0;
  }
  18% {
    transform: translate3d(-50%, 0, 0) scale(1);
    opacity: 1;
  }
  58% {
    transform: translate3d(-50%, -1.2%, 0) scale(1.012);
    opacity: 1;
  }
  100% {
    transform: translate3d(-50%, 0.6%, 0) scale(0.997);
    opacity: 1;
  }
`;

const floatInRight = keyframes`
  0% {
    transform: translate3d(18%, 16%, 0) rotate(7deg) scale(1.05);
    opacity: 0;
  }
  18% {
    transform: translate3d(0, 0, 0) rotate(0deg) scale(1);
    opacity: 1;
  }
  58% {
    transform: translate3d(0, -1.6%, 0) rotate(0.9deg) scale(1.016);
    opacity: 1;
  }
  100% {
    transform: translate3d(0, 0.8%, 0) rotate(-0.5deg) scale(0.997);
    opacity: 1;
  }
`;

const breatheLeft = keyframes`
  0%, 100% { transform: translate3d(0, 0, 0) rotate(0deg) scale(1); }
  50% { transform: translate3d(0, -1.8%, 0) rotate(-1.1deg) scale(1.018); }
`;

const breatheCenterDesktop = keyframes`
  0%, 100% { transform: translate3d(-50%, 0, 0) scale(1); }
  50% { transform: translate3d(-50%, -1.5%, 0) scale(1.015); }
`;

const breatheCenterMobile = keyframes`
  0%, 100% { transform: translate3d(-50%, 0, 0) scale(1); }
  50% { transform: translate3d(-50%, -1.2%, 0) scale(1.012); }
`;

const breatheRight = keyframes`
  0%, 100% { transform: translate3d(0, 0, 0) rotate(0deg) scale(1); }
  50% { transform: translate3d(0, -1.6%, 0) rotate(0.9deg) scale(1.016); }
`;

/* ---------------- Screen ---------------- */
const Screen = styled(Bg)`
  height: 100dvh;
  width: 100%;
  overflow: hidden;
  position: relative;

  overscroll-behavior: none;
  touch-action: none;
  -webkit-user-select: none;
  user-select: none;

  background:
    radial-gradient(1200px 900px at 18% 10%, rgba(158,15,20,0.20), transparent 60%),
    radial-gradient(900px 700px at 86% 28%, rgba(231,162,108,0.14), transparent 60%),
    radial-gradient(1200px 900px at 50% 110%, rgba(0,0,0,0.16), transparent 55%),
    linear-gradient(165deg, #ffffff 0%, #fbfaf8 38%, #f5efe8 70%, #f2e6dc 100%);

  &::after {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 4;
    background:
      radial-gradient(120% 70% at 50% 118%, rgba(0,0,0,0.26), transparent 60%),
      linear-gradient(to top, rgba(0,0,0,0.14) 0%, transparent 48%);
  }

  @media (max-width: 640px) {
    background:
      radial-gradient(120% 90% at 50% 0%, rgba(255,255,255,0.52), transparent 55%),
      radial-gradient(80% 60% at 100% 20%, rgba(245,196,126,0.28), transparent 60%),
      linear-gradient(180deg, #fff7ef 0%, #f9e4cf 52%, #efcaa6 100%);
  }
`;

/* ---------------- Conteúdo ---------------- */
const Content = styled.div`
  position: relative;
  z-index: 10;
  width: 100%;
  height: 100%;

  @media (max-width: 640px) {
    padding: max(20px, env(safe-area-inset-top)) 16px max(24px, env(safe-area-inset-bottom));
  }
`;

/* Logo */
const Top = styled.div`
  position: absolute;
  top: clamp(30px, 6vh, 80px);
  left: 50%;
  transform: translateX(-50%);

  @media (max-width: 640px) {
    top: max(18px, env(safe-area-inset-top));
    width: calc(100% - 32px);
    display: flex;
    justify-content: center;
  }
`;

const Logo = styled.img`
  width: min(520px, 78vw);
  height: auto;
  filter: drop-shadow(0 18px 30px rgba(0,0,0,0.15));
  cursor: pointer;

  @media (max-width: 640px) {
    width: min(320px, 78vw);
  }
`;

/* Botão central */
const CenterBlock = styled.div`
  position: absolute;
  top: 52%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: min(720px, 94vw);

  display: flex;
  flex-direction: column;
  align-items: center;

  @media (max-width: 640px) {
    top: 50%;
    width: calc(100% - 32px);
  }
`;

const MobileHint = styled.p`
  display: none;

  @media (max-width: 640px) {
    display: block;
    margin: 12px 0 0;
    color: rgba(94, 24, 24, 0.72);
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 0.01em;
    text-align: center;
  }
`;

const PrimaryBtn = styled.button`
  width: 100%;
  height: clamp(102px, 11vh, 130px); /* 🔥 +10% maior */
  border-radius: 28px;
  border: 0;
  cursor: pointer;

  display: flex;
  align-items: center;
  justify-content: center;

  color: #fff;
  font-size: clamp(26px, 2.8vh, 34px); /* 🔥 texto maior */
  font-weight: 950;

  background: linear-gradient(180deg, #c22b2b 0%, #9e0f14 58%, #7f0b0f 100%);
  box-shadow:
    0 28px 70px rgba(158,15,20,0.36),
    0 12px 22px rgba(0,0,0,0.18),
    inset 0 1px 0 rgba(255,255,255,0.24);

  animation: ${pulse} 2s ease-in-out infinite;

  position: relative;
  overflow: hidden;

  &::after {
    content: "";
    position: absolute;
    top: -45%;
    left: -40%;
    width: 58%;
    height: 210%;
    background: linear-gradient(
      120deg,
      rgba(255,255,255,0) 0%,
      rgba(255,255,255,0.6) 45%,
      rgba(255,255,255,0) 70%
    );
    transform: translateX(-120%) rotate(8deg);
    animation: ${sheen} 3.6s ease-in-out infinite;
  }

  &:active {
    transform: scale(0.99);
  }

  @media (max-width: 640px) {
    height: 88px;
    border-radius: 24px;
    font-size: 26px;
  }
`;

/* ---------------- Imagens ---------------- */
const Bottom = styled.div`
  position: absolute;
  inset: 0;
  bottom: 0;
  pointer-events: none;
  z-index: 3;
`;

const ImgLeft = styled.img`
  position: absolute;
  bottom: -10%;
  left: -32%;
  width: min(1180px, 100vw);
  z-index: 2;
  opacity: 0;
  animation:
    ${floatInLeft} 1s cubic-bezier(0.2, 0.8, 0.2, 1) 0.08s forwards,
    ${breatheLeft} 6.6s ease-in-out 1.08s infinite;

  @media (max-width: 640px) {
    display: none;
  }
`;

const ImgCenter = styled.img`
  position: absolute;
  bottom: -7%;
  left: 50%;
  transform: translateX(-50%);
  width: min(960px, 86vw);
  z-index: 3;

  filter:
    brightness(1.15)
    saturate(1.05)
    drop-shadow(0 24px 46px rgba(0,0,0,0.18));
  opacity: 0;
  animation:
    ${floatInCenterDesktop} 1.05s cubic-bezier(0.2, 0.8, 0.2, 1) 0.16s forwards,
    ${breatheCenterDesktop} 7.1s ease-in-out 1.21s infinite;

  @media (max-width: 640px) {
    display: block;
    left: 54.5%;
    right: auto;
    bottom: -15%;
    transform: translateX(-50%);
    width: 154.01394918vw;
    max-width: none;
    height: 52.3647427212dvh;
    object-fit: cover;
    object-position: center bottom;
    filter:
      brightness(1.05)
      saturate(1.02)
      drop-shadow(0 18px 28px rgba(0,0,0,0.14));
    animation:
      ${floatInCenterMobile} 1.05s cubic-bezier(0.2, 0.8, 0.2, 1) 0.12s forwards,
      ${breatheCenterMobile} 7.2s ease-in-out 1.17s infinite;
  }
`;

const ImgRight = styled.img`
  position: absolute;
  bottom: -2%;
  right: -20%;
  width: min(865px, 84vw);
  z-index: 2;
  opacity: 0;
  animation:
    ${floatInRight} 1s cubic-bezier(0.2, 0.8, 0.2, 1) 0.12s forwards,
    ${breatheRight} 6.8s ease-in-out 1.12s infinite;

  @media (max-width: 640px) {
    display: none;
  }
`;

const HiddenForm = styled.form`
  display: grid;
  gap: 18px;
`;

const HiddenHelp = styled.p`
  margin: 0;
  color: rgba(97, 34, 34, 0.86);
  font-size: 15px;
  line-height: 1.5;
  text-align: center;
`;

const HiddenError = styled.p`
  margin: 0;
  color: #b42318;
  font-size: 14px;
  font-weight: 700;
  text-align: center;
`;

const HiddenActions = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
`;

const HiddenButton = styled.button<{ $variant?: "ghost" | "primary" }>`
  height: 54px;
  border-radius: 18px;
  border: ${({ $variant }) => ($variant === "ghost" ? "1px solid rgba(255,255,255,0.42)" : "0")};
  background: ${({ $variant }) =>
    $variant === "ghost"
      ? "rgba(255,255,255,0.52)"
      : "linear-gradient(180deg, rgba(194,43,43,0.96) 0%, rgba(126,11,15,0.98) 100%)"};
  color: ${({ $variant }) => ($variant === "ghost" ? "#5a1e1e" : "#fff")};
  padding: 0 18px;
  font-size: 15px;
  font-weight: 800;
  cursor: pointer;
  box-shadow: ${({ $variant }) =>
    $variant === "ghost" ? "inset 0 1px 0 rgba(255,255,255,0.36)" : "0 18px 32px rgba(120,14,18,0.28)"};
  opacity: ${({ disabled }) => (disabled ? 0.6 : 1)};
  backdrop-filter: blur(16px) saturate(1.2);
  -webkit-backdrop-filter: blur(16px) saturate(1.2);
  transition: transform 140ms ease, box-shadow 140ms ease, background 140ms ease;

  &:active {
    transform: scale(0.98);
  }
`;

const GlassDialogContent = styled(DialogContent)`
  width: min(92vw, 520px);
  border-radius: 32px;
  border: 1px solid rgba(255, 255, 255, 0.4);
  background:
    linear-gradient(180deg, rgba(255,255,255,0.72) 0%, rgba(255,248,244,0.58) 100%);
  box-shadow:
    0 30px 80px rgba(32, 12, 12, 0.22),
    inset 0 1px 0 rgba(255,255,255,0.54);
  backdrop-filter: blur(26px) saturate(1.25);
  -webkit-backdrop-filter: blur(26px) saturate(1.25);
  padding: 24px;
  overflow: hidden;

  &::before {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    background:
      radial-gradient(circle at top left, rgba(255,255,255,0.56), transparent 36%),
      radial-gradient(circle at bottom right, rgba(201,39,39,0.12), transparent 34%);
  }

  @media (max-width: 640px) {
    width: calc(100vw - 24px);
    border-radius: 28px;
    padding: 20px;
  }
`;

const GlassHeader = styled(DialogHeader)`
  position: relative;
  z-index: 1;
  gap: 8px;
  text-align: center;
`;

const GlassTitle = styled(DialogTitle)`
  font-size: clamp(28px, 3vw, 34px);
  font-weight: 800;
  color: #4e1616;
  letter-spacing: -0.03em;
  text-align: center;
`;

const PinDots = styled.div`
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-top: 4px;
`;

const PinDot = styled.span<{ $filled: boolean }>`
  width: 14px;
  height: 14px;
  border-radius: 999px;
  background: ${({ $filled }) => ($filled ? "#8f1014" : "rgba(110,36,36,0.12)")};
  box-shadow: ${({ $filled }) =>
    $filled
      ? "0 6px 16px rgba(143,16,20,0.32), inset 0 1px 0 rgba(255,255,255,0.2)"
      : "inset 0 1px 0 rgba(255,255,255,0.42)"};
  transition: all 160ms ease;
`;

const KeypadShell = styled.div`
  position: relative;
  z-index: 1;
  display: grid;
  gap: 14px;
`;

const KeypadGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
`;

const KeyButton = styled.button<{ $accent?: boolean }>`
  height: 76px;
  border-radius: 22px;
  border: 1px solid rgba(255,255,255,0.42);
  background: ${({ $accent }) =>
    $accent
      ? "linear-gradient(180deg, rgba(163,18,24,0.96) 0%, rgba(126,11,15,0.98) 100%)"
      : "linear-gradient(180deg, rgba(255,255,255,0.64) 0%, rgba(255,246,242,0.46) 100%)"};
  color: ${({ $accent }) => ($accent ? "#fff" : "#571b1b")};
  font-size: 30px;
  font-weight: 700;
  letter-spacing: -0.03em;
  cursor: pointer;
  backdrop-filter: blur(18px) saturate(1.15);
  -webkit-backdrop-filter: blur(18px) saturate(1.15);
  box-shadow:
    ${({ $accent }) =>
      $accent
        ? "0 18px 32px rgba(126,11,15,0.28), inset 0 1px 0 rgba(255,255,255,0.18)"
        : "0 14px 24px rgba(128,72,72,0.12), inset 0 1px 0 rgba(255,255,255,0.5)"};
  transition: transform 140ms ease, box-shadow 140ms ease, filter 140ms ease;

  &:active {
    transform: scale(0.97);
    filter: brightness(0.98);
  }

  @media (max-width: 640px) {
    height: 70px;
    font-size: 28px;
  }
`;

/* ---------------- Component ---------------- */
export default function Start() {
  const ADMIN_SHORTCUT_PIN = "250402";
  const PIN_LENGTH = ADMIN_SHORTCUT_PIN.length;
  const KEYPAD_VALUES = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
  const navigate = useNavigate();
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminPin, setAdminPin] = useState("");
  const [adminError, setAdminError] = useState("");
  const [adminLoading, setAdminLoading] = useState(false);
  const tapCountRef = useRef(0);
  const tapTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const warmNextRoutes = () => {
      void import("./ContextoCompra");
      void import("./Index");
    };

    let idleCallbackId: number | null = null;
    let timeoutId: number | null = null;

    if (typeof window.requestIdleCallback === "function") {
      idleCallbackId = window.requestIdleCallback(warmNextRoutes, { timeout: 1200 });
    } else {
      timeoutId = window.setTimeout(warmNextRoutes, 500);
    }

    return () => {
      if (typeof window.cancelIdleCallback === "function" && idleCallbackId !== null) {
        window.cancelIdleCallback(idleCallbackId);
      }
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (tapTimerRef.current) {
        clearTimeout(tapTimerRef.current);
      }
    };
  }, []);

  function go() {
    try {
      localStorage.removeItem("pricing_context");
      clearCustomerSession();
      emitAppEvent(APP_EVENT.pricingContextChanged);
    } catch {}
    navigate("/contexto");
  }

  function handleLogoTap() {
    if (tapTimerRef.current) {
      clearTimeout(tapTimerRef.current);
    }

    tapCountRef.current += 1;
    tapTimerRef.current = window.setTimeout(() => {
      tapCountRef.current = 0;
      tapTimerRef.current = null;
    }, 2200);

    if (tapCountRef.current >= 5) {
      tapCountRef.current = 0;
      setAdminError("");
      setAdminPin("");
      setAdminOpen(true);
    }
  }

  async function handleAdminShortcutSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAdminError("");

    if (adminPin.trim() !== ADMIN_SHORTCUT_PIN) {
      setAdminError("PIN inválido.");
      return;
    }

    setAdminLoading(true);
    try {
      saveCustomerSession({
        id: "admin-shortcut",
        name: "Administrador",
        document: "admin-shortcut",
        role: "admin",
      });
      setAdminOpen(false);
      navigate("/catalogo", { replace: true });
    } catch (error: any) {
      setAdminError(error?.message || "Não foi possível validar o acesso.");
    } finally {
      setAdminLoading(false);
    }
  }

  function pushDigit(value: string) {
    setAdminError("");
    setAdminPin((current) => {
      if (current.length >= PIN_LENGTH) return current;
      return `${current}${value}`;
    });
  }

  function clearLastDigit() {
    setAdminError("");
    setAdminPin((current) => current.slice(0, -1));
  }

  return (
    <Screen>
      <Content>
        <Top>
          <Logo src={logoGostinho} alt="Gostinho Mineiro" onClick={handleLogoTap} />
        </Top>

        <CenterBlock>
          <PrimaryBtn type="button" onClick={go}>
            <span className="hidden sm:inline">Começar</span>
            <span className="sm:hidden">Adiante seu pedido</span>
          </PrimaryBtn>
          <MobileHint>clique para começar</MobileHint>
        </CenterBlock>
      </Content>

      <Bottom>
        <ImgLeft src={biscoitoImg} alt="" />
        <ImgCenter src={paoDeQueijoImg} alt="" />
        <ImgRight src={paoImg} alt="" />
      </Bottom>

      <Dialog open={adminOpen} onOpenChange={setAdminOpen}>
        <GlassDialogContent>
          <GlassHeader>
            <GlassTitle>Acesso admin</GlassTitle>
          </GlassHeader>

          <HiddenForm onSubmit={handleAdminShortcutSubmit}>
            <HiddenHelp>
              Informe o PIN de acesso administrativo.
            </HiddenHelp>

            <PinDots aria-hidden="true">
              {Array.from({ length: PIN_LENGTH }).map((_, index) => (
                <PinDot key={index} $filled={index < adminPin.length} />
              ))}
            </PinDots>

            <KeypadShell>
              <KeypadGrid>
                {KEYPAD_VALUES.map((value) => (
                  <KeyButton
                    key={value}
                    type="button"
                    onClick={() => pushDigit(value)}
                    disabled={adminLoading}
                    aria-label={`Digitar ${value}`}
                  >
                    {value}
                  </KeyButton>
                ))}
                <KeyButton
                  type="button"
                  onClick={clearLastDigit}
                  disabled={adminLoading || adminPin.length === 0}
                  aria-label="Apagar último dígito"
                >
                  ←
                </KeyButton>
                <KeyButton
                  type="button"
                  onClick={() => pushDigit("0")}
                  disabled={adminLoading}
                  aria-label="Digitar 0"
                >
                  0
                </KeyButton>
                <KeyButton
                  type="submit"
                  $accent
                  disabled={adminLoading || adminPin.length !== PIN_LENGTH}
                  aria-label="Confirmar PIN"
                >
                  OK
                </KeyButton>
              </KeypadGrid>
            </KeypadShell>

            {adminError ? <HiddenError>{adminError}</HiddenError> : null}

            <HiddenActions>
              <HiddenButton
                type="button"
                $variant="ghost"
                onClick={() => setAdminOpen(false)}
                disabled={adminLoading}
              >
                Cancelar
              </HiddenButton>
              <HiddenButton
                type="button"
                onClick={() => {
                  setAdminError("");
                  setAdminPin("");
                }}
                disabled={adminLoading || adminPin.length === 0}
              >
                Limpar
              </HiddenButton>
            </HiddenActions>
          </HiddenForm>
        </GlassDialogContent>
      </Dialog>
    </Screen>
  );
}
