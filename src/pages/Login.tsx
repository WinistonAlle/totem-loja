// src/pages/Login.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import styled, { keyframes } from "styled-components";
import { motion } from "framer-motion";
import { Bg, Card } from "../components/ui/app-surface";
import logo from "../images/logoc.png";
import { supabase } from "@/lib/supabase";
import { getCustomerSessionSnapshotOrNull } from "@/utils/customerSession";

/* =========================================================
   ✅ MOBILE bom (sem mexer no TOTEM)
   - Totem/desktop mantém SCALE 1.3 + dimensões grandes
   - Mobile reduz escala, altura do card, teclado e paddings
========================================================= */
const SCALE = 1.3;
const px = (n: number) => `${Math.round(n * SCALE)}px`;

/* ================= PAGE LOCK (sem scroll/bounce) ================= */

const Screen = styled(Bg)`
  height: 100dvh;
  width: 100%;
  overflow: hidden;

  overscroll-behavior: none;
  touch-action: none;

  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);

  display: flex;
  align-items: center;
  justify-content: center;

  /* MOBILE: deixa “respirar” e evita card colar nas bordas */
  @media (max-width: 640px) {
    align-items: flex-start;
    padding-top: calc(env(safe-area-inset-top) + 14px);
    padding-bottom: calc(env(safe-area-inset-bottom) + 14px);
  }
`;

/* ================= LOADING (Uiverse 3 dots) ================= */

const LoadingOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 9999;

  background: rgba(164, 22, 22, 0.82);
  backdrop-filter: blur(8px);

  display: flex;
  align-items: center;
  justify-content: center;

  pointer-events: all;
`;

const Frame = styled.div`
  position: relative;
  width: ${px(220)};
  height: ${px(220)};

  @media (max-width: 640px) {
    width: 180px;
    height: 180px;
  }
`;

const Center = styled.div`
  position: absolute;
  width: ${px(220)};
  height: ${px(220)};

  @media (max-width: 640px) {
    width: 180px;
    height: 180px;
  }
`;

const jump1 = keyframes`
  0%, 70% { box-shadow: 2px 2px 3px 2px rgba(0,0,0,0.2); transform: scale(0); }
  100% { box-shadow: 10px 10px 15px 0 rgba(0,0,0,0.3); transform: scale(1); }
`;

const jump2 = keyframes`
  0%, 40% { box-shadow: 2px 2px 3px 2px rgba(0,0,0,0.2); transform: scale(0); }
  100% { box-shadow: 10px 10px 15px 0 rgba(0,0,0,0.3); transform: scale(1); }
`;

const jump3 = keyframes`
  0%, 10% { box-shadow: 2px 2px 3px 2px rgba(0,0,0,0.2); transform: scale(0); }
  100% { box-shadow: 10px 10px 15px 0 rgba(0,0,0,0.3); transform: scale(1); }
`;

const Dot1 = styled.div`
  position: absolute;
  z-index: 3;
  width: ${px(30)};
  height: ${px(30)};
  top: ${px(95)};
  left: ${px(95)};
  background: #fff;
  border-radius: 50%;
  animation: ${jump1} 2s cubic-bezier(0.21, 0.98, 0.6, 0.99) infinite alternate;

  @media (max-width: 640px) {
    width: 24px;
    height: 24px;
    top: 78px;
    left: 78px;
  }
`;

const Dot2 = styled.div`
  position: absolute;
  z-index: 2;
  width: ${px(60)};
  height: ${px(60)};
  top: ${px(80)};
  left: ${px(80)};
  background: #f0be00;
  border-radius: 50%;
  animation: ${jump2} 2s cubic-bezier(0.21, 0.98, 0.6, 0.99) infinite alternate;

  @media (max-width: 640px) {
    width: 46px;
    height: 46px;
    top: 67px;
    left: 67px;
  }
`;

const Dot3 = styled.div`
  position: absolute;
  z-index: 1;
  width: ${px(90)};
  height: ${px(90)};
  top: ${px(65)};
  left: ${px(65)};
  background: #d33100;
  border-radius: 50%;
  animation: ${jump3} 2s cubic-bezier(0.21, 0.98, 0.6, 0.99) infinite alternate;

  @media (max-width: 640px) {
    width: 70px;
    height: 70px;
    top: 55px;
    left: 55px;
  }
`;

const LoadingText = styled.div`
  position: absolute;
  width: 100%;
  left: 0;
  bottom: calc(${px(-46)} - 2px);
  text-align: center;
  color: rgba(255, 255, 255, 0.92);
  font-weight: 700;
  font-size: ${px(14)};
  letter-spacing: 0.02em;

  @media (max-width: 640px) {
    bottom: -38px;
    font-size: 13px;
  }
`;

/* ================= BOTÃO SAIR (TOP LEFT) ================= */

const BackButton = styled.button`
  position: fixed;
  top: calc(${px(16)} + env(safe-area-inset-top));
  left: ${px(16)};
  width: ${px(44)};
  height: ${px(44)};
  border-radius: 50%;
  border: 0;
  background: rgba(0, 0, 0, 0.18);
  color: #111;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(6px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  transition: background 0.2s ease, transform 0.1s ease, box-shadow 0.2s ease;
  user-select: none;
  -webkit-tap-highlight-color: transparent;

  &:hover {
    background: rgba(0, 0, 0, 0.28);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.35);
  }

  &:active {
    transform: scale(0.95);
  }

  svg {
    width: ${px(20)};
    height: ${px(20)};
  }

  /* MOBILE: menor e mais “no canto” */
  @media (max-width: 640px) {
    top: calc(12px + env(safe-area-inset-top));
    left: 12px;
    width: 42px;
    height: 42px;
    svg {
      width: 19px;
      height: 19px;
    }
  }
`;

/* ================= LAYOUT ================= */

const popIn = keyframes`
  0% { transform: translateY(10px) scale(.985); opacity: 0; }
  100% { transform: translateY(0) scale(1); opacity: 1; }
`;

/**
 * ✅ Totem: continua largo/grande
 * ✅ Mobile: largura 100% (com margem), padding menor, altura “fit”
 */
const StyledCard = styled(Card)`
  width: clamp(380px, 72vw, 840px);
  max-width: calc(100% - ${px(56)});
  box-sizing: border-box;

  animation: ${popIn} 520ms cubic-bezier(0.2, 0.9, 0.2, 1) both;

  background: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.06);
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.18);

  padding: ${px(22)};
  border-radius: ${px(18)};

  /* MOBILE */
  @media (max-width: 640px) {
    width: calc(100% - 24px);
    max-width: 520px;
    padding: 16px;
    border-radius: 18px;
    box-shadow: 0 14px 36px rgba(0, 0, 0, 0.16);
  }
`;

const LogoWrapper = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  margin-bottom: ${px(14)};

  @media (max-width: 640px) {
    margin-bottom: 10px;
  }
`;

const logoFloat = keyframes`
  0% { transform: translateY(0); filter: drop-shadow(0 6px 10px rgba(0,0,0,.14)); }
  50% { transform: translateY(-4px); filter: drop-shadow(0 10px 14px rgba(0,0,0,.18)); }
  100% { transform: translateY(0); filter: drop-shadow(0 6px 10px rgba(0,0,0,.14)); }
`;

const LogoImg = styled.img`
  width: ${px(183)};
  height: auto;
  user-select: none;
  animation: ${logoFloat} 3.8s ease-in-out infinite;

  @media (max-width: 640px) {
    width: 150px;
    animation: none;
    filter: drop-shadow(0 8px 14px rgba(0, 0, 0, 0.18));
  }
`;

const Title = styled.h1`
  margin: 0 0 ${px(4)};
  font-size: calc(1.45rem * ${SCALE});
  font-weight: 900;
  color: #2b2b2b;
  text-align: center;
  letter-spacing: -0.02em;

  @media (max-width: 640px) {
    font-size: 22px;
    margin-bottom: 4px;
  }
`;

const Subtitle = styled.p`
  margin: 0 0 ${px(14)};
  color: #707070;
  font-size: calc(0.95rem * ${SCALE});
  text-align: center;

  @media (max-width: 640px) {
    font-size: 13px;
    margin-bottom: 12px;
  }
`;

const Form = styled.form`
  display: grid;
  gap: ${px(12)};

  @media (max-width: 640px) {
    gap: 10px;
  }
`;

const Field = styled.div`
  display: grid;
  gap: ${px(8)};

  @media (max-width: 640px) {
    gap: 8px;
  }
`;

const Label = styled.label`
  font-size: calc(0.9rem * ${SCALE});
  color: #444;

  @media (max-width: 640px) {
    font-size: 13px;
    font-weight: 800;
  }
`;

/* ================= INPUT (Uiverse aplicado) ================= */

const InputShell = styled.div`
  position: relative;
`;

const InputIcon = styled.div`
  position: absolute;
  left: ${px(14)};
  top: 50%;
  transform: translateY(-50%);
  width: ${px(34)};
  height: ${px(34)};
  border-radius: ${px(12)};

  display: grid;
  place-items: center;

  background: rgba(164, 22, 22, 0.08);
  border: 1px solid rgba(164, 22, 22, 0.12);

  svg {
    width: ${px(18)};
    height: ${px(18)};
    color: rgba(125, 23, 23, 0.9);
  }

  @media (max-width: 640px) {
    left: 12px;
    width: 34px;
    height: 34px;
    border-radius: 12px;
    svg {
      width: 18px;
      height: 18px;
    }
  }
`;

const NeumorphicInput = styled.input`
  width: 100%;
  max-width: 100%;
  border: none;
  outline: none;
  background: none;
  font-size: ${px(22)};
  font-weight: 900;
  color: #2b2b2b;

  padding: ${px(16)} ${px(14)} ${px(12)} ${px(58)};

  box-shadow: inset 8px 8px 8px #cbced1, inset -8px -8px 8px #ffffff;
  border-radius: ${px(25)};
  transition: box-shadow 0.15s ease;

  &::placeholder {
    color: #777;
    transition: all 0.3s ease;
    font-weight: 700;
  }

  &:focus-visible {
    box-shadow: inset 8px 8px 8px #cbced1, inset -8px -4px 8px #ffffff,
      0 0 0 3px rgba(184, 38, 38, 0.18);
  }

  &:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  /* MOBILE: menos alto e fonte menor (pra não “estourar”) */
  @media (max-width: 640px) {
    font-size: 18px;
    padding: 14px 12px 12px 52px;
    border-radius: 20px;
    box-shadow: inset 7px 7px 10px #cbced1, inset -7px -7px 10px #ffffff;
  }
`;

const Helper = styled.p`
  margin: ${px(2)} 0 0;
  font-size: calc(0.86rem * ${SCALE});
  color: #6f6f6f;

  @media (max-width: 640px) {
    margin: 2px 0 0;
    font-size: 12px;
  }
`;

const ErrorMsg = styled.p`
  margin: ${px(6)} 0 0;
  font-size: calc(0.95rem * ${SCALE});
  font-weight: 800;
  color: #b30000;

  @media (max-width: 640px) {
    margin-top: 6px;
    font-size: 13px;
  }
`;

/* ================= BOTÕES ================= */

const shine = keyframes`
  0% { transform: translateX(-120%) skewX(-15deg); opacity: 0; }
  30% { opacity: .55; }
  100% { transform: translateX(160%) skewX(-15deg); opacity: 0; }
`;

const PrimaryButton = styled.button`
  height: ${px(56)};
  padding: calc(0.7em * ${SCALE}) calc(1.7em * ${SCALE});
  font-size: calc(1.08rem * ${SCALE});
  font-weight: 900;
  border-radius: ${px(16)};
  cursor: pointer;

  background: linear-gradient(135deg, #b82626, #7d1717);
  color: #fff;

  border: 1px solid rgba(255, 255, 255, 0.1);

  box-shadow: 10px 12px 22px rgba(0, 0, 0, 0.28),
    -6px -6px 12px rgba(255, 255, 255, 0.08);

  transition: transform 0.12s ease, box-shadow 0.25s ease, filter 0.2s ease;
  position: relative;
  overflow: hidden;

  &::after {
    content: "";
    position: absolute;
    inset: 0;
    width: 40%;
    background: linear-gradient(
      90deg,
      rgba(255, 255, 255, 0),
      rgba(255, 255, 255, 0.35),
      rgba(255, 255, 255, 0)
    );
    transform: translateX(-120%) skewX(-15deg);
  }

  &:hover::after {
    animation: ${shine} 900ms ease;
  }

  &:hover {
    transform: translateY(-1px);
    filter: brightness(1.02);
  }

  &:active {
    transform: translateY(0);
    box-shadow: inset 4px 4px 12px rgba(0, 0, 0, 0.35),
      inset -4px -4px 12px rgba(255, 255, 255, 0.08);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    box-shadow: none;
  }

  @media (max-width: 640px) {
    height: 50px;
    font-size: 16px;
    border-radius: 16px;
  }
`;

const ActionsRow = styled.div`
  margin-top: ${px(4)};
  display: grid;
  grid-template-columns: 1fr;
  gap: ${px(10)};

  @media (max-width: 640px) {
    gap: 10px;
    margin-top: 4px;
  }
`;

const ActionButton = styled.button<{ $variant?: "gold" | "ghost" }>`
  height: ${px(52)};
  border-radius: ${px(16)};
  border: 1px solid rgba(125, 23, 23, 0.18);
  cursor: pointer;
  font-weight: 900;
  letter-spacing: -0.01em;

  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: ${px(10)};

  padding: 0 ${px(14)};
  -webkit-tap-highlight-color: transparent;

  background: ${(p) =>
    p.$variant === "ghost"
      ? "#ffffff"
      : "linear-gradient(135deg, rgba(240,190,0,0.95), rgba(255,215,72,0.92))"};

  color: ${(p) => (p.$variant === "ghost" ? "#7d1717" : "#3b2200")};

  box-shadow: ${(p) =>
    p.$variant === "ghost"
      ? "0 10px 18px rgba(0,0,0,.08)"
      : "0 12px 22px rgba(0,0,0,.14)"};

  transition: transform 0.12s ease, box-shadow 0.2s ease, filter 0.2s ease;

  &:hover {
    transform: translateY(-1px);
    filter: brightness(1.01);
  }

  &:active {
    transform: translateY(0);
    box-shadow: inset 3px 3px 10px rgba(0, 0, 0, 0.16);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    box-shadow: none;
  }

  svg {
    width: ${px(18)};
    height: ${px(18)};
  }

  @media (max-width: 640px) {
    height: 48px;
    border-radius: 16px;
    font-size: 15px;
    gap: 10px;

    svg {
      width: 18px;
      height: 18px;
    }
  }
`;

const Divider = styled.div`
  margin: ${px(10)} 0 ${px(2)};
  height: 1px;
  background: linear-gradient(
    90deg,
    rgba(0, 0, 0, 0),
    rgba(0, 0, 0, 0.12),
    rgba(0, 0, 0, 0)
  );

  @media (max-width: 640px) {
    margin: 10px 0 2px;
  }
`;

/* ================= TECLADO TOTEM ================= */

const KeypadWrap = styled.div`
  margin-top: ${px(8)};
  display: grid;
  gap: ${px(10)};

  /* MOBILE: teclado mais compacto e cabe sem “estourar” */
  @media (max-width: 640px) {
    margin-top: 8px;
    gap: 10px;
  }
`;

const KeypadGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: ${px(10)};

  @media (max-width: 640px) {
    gap: 10px;
  }
`;

const KeyButton = styled(motion.button)<{ $variant?: "num" | "danger" | "ghost" }>`
  height: ${px(62)};
  border-radius: ${px(18)};
  border: 1px solid rgba(0, 0, 0, 0.08);
  background: ${(p) =>
    p.$variant === "danger"
      ? "linear-gradient(135deg, rgba(184,38,38,0.16), rgba(125,23,23,0.12))"
      : p.$variant === "ghost"
      ? "linear-gradient(135deg, rgba(0,0,0,0.03), rgba(0,0,0,0.01))"
      : "linear-gradient(135deg, rgba(255,255,255,1), rgba(250,250,250,1))"};

  box-shadow: 0 10px 18px rgba(0, 0, 0, 0.08);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  user-select: none;

  display: grid;
  place-items: center;

  font-weight: 1000;
  font-size: ${px(22)};
  color: ${(p) => (p.$variant === "danger" ? "#7d1717" : "#2b2b2b")};

  &:active {
    box-shadow: inset 3px 3px 10px rgba(0, 0, 0, 0.12);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    box-shadow: none;
  }

  /* MOBILE */
  @media (max-width: 640px) {
    height: 54px;
    border-radius: 16px;
    font-size: 18px;
  }
`;

const KeyRow = styled.div`
  display: grid;
  grid-template-columns: 1.2fr 1fr 1.2fr;
  gap: ${px(10)};

  @media (max-width: 640px) {
    gap: 10px;
  }
`;

const MiniKey = styled(motion.button)<{ $variant?: "danger" | "ghost" }>`
  height: ${px(54)};
  border-radius: ${px(16)};
  border: 1px solid rgba(0, 0, 0, 0.08);
  background: ${(p) =>
    p.$variant === "danger"
      ? "linear-gradient(135deg, rgba(184,38,38,0.16), rgba(125,23,23,0.12))"
      : "linear-gradient(135deg, rgba(0,0,0,0.03), rgba(0,0,0,0.01))"};
  box-shadow: 0 10px 18px rgba(0, 0, 0, 0.08);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  user-select: none;

  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: ${px(10)};

  font-weight: 950;
  font-size: ${px(15)};
  color: ${(p) => (p.$variant === "danger" ? "#7d1717" : "#2b2b2b")};

  &:active {
    box-shadow: inset 3px 3px 10px rgba(0, 0, 0, 0.12);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    box-shadow: none;
  }

  svg {
    width: ${px(18)};
    height: ${px(18)};
  }

  /* MOBILE */
  @media (max-width: 640px) {
    height: 48px;
    border-radius: 16px;
    font-size: 13px;
    gap: 8px;

    svg {
      width: 18px;
      height: 18px;
    }
  }
`;

/* ================= UTIL ================= */

type CustomerType = "cpf" | "cnpj";

const onlyDigits = (v: string) => v.replace(/\D/g, "");

const maskCPF = (v: string) => {
  const d = onlyDigits(v).slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
};

const maskCNPJ = (v: string) => {
  const d = onlyDigits(v).slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
};

function isRepeatedDigits(digits: string) {
  return /^(\d)\1+$/.test(digits);
}

function getCustomerSessionFromStorage() {
  return getCustomerSessionSnapshotOrNull();
}

function getPricingContextCustomerType(): CustomerType | null {
  try {
    const raw = localStorage.getItem("pricing_context");
    if (!raw) return null;
    const ctx = JSON.parse(raw);
    const t = ctx?.customer_type;
    if (t === "cpf" || t === "cnpj") return t;
    return null;
  } catch {
    return null;
  }
}

function canAttemptLogin(docDigits: string, forcedType: CustomerType | null) {
  if (!docDigits) return false;

  const len = docDigits.length;

  if (forcedType === "cpf") {
    if (len !== 11) return false;
  } else if (forcedType === "cnpj") {
    if (len !== 14) return false;
  } else {
    if (len !== 11 && len !== 14) return false;
  }

  if (isRepeatedDigits(docDigits)) return false;
  return true;
}

/* ================= COMPONENT ================= */

const Login: React.FC = () => {
  const navigate = useNavigate();

  const forcedType = useMemo(() => getPricingContextCustomerType(), []);
  const maxLen = forcedType === "cpf" ? 11 : forcedType === "cnpj" ? 14 : 14;

  const [docDigits, setDocDigits] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    const existing = getCustomerSessionFromStorage();
    const id = existing?.id ?? existing?.customer_id ?? null;
    const document = existing?.document ?? existing?.customer_document ?? null;
    if (id || document) {
      navigate("/catalogo", { replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    const prev = {
      htmlOverflow: document.documentElement.style.overflow,
      bodyOverflow: document.body.style.overflow,
      bodyPosition: document.body.style.position,
      bodyInset: (document.body.style as any).inset,
      bodyWidth: document.body.style.width,
      htmlBg: document.documentElement.style.background,
      bodyBg: document.body.style.background,
    };

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    (document.body.style as any).inset = "0";
    document.body.style.width = "100%";

    document.documentElement.style.background = "#a41616";
    document.body.style.background = "#a41616";

    return () => {
      document.documentElement.style.overflow = prev.htmlOverflow;
      document.body.style.overflow = prev.bodyOverflow;
      document.body.style.position = prev.bodyPosition;
      (document.body.style as any).inset = prev.bodyInset;
      document.body.style.width = prev.bodyWidth;
      document.documentElement.style.background = prev.htmlBg;
      document.body.style.background = prev.bodyBg;
    };
  }, []);

  const masked = useMemo(() => {
    if (forcedType === "cpf") return maskCPF(docDigits);
    if (forcedType === "cnpj") return maskCNPJ(docDigits);
    return docDigits.length <= 11 ? maskCPF(docDigits) : maskCNPJ(docDigits);
  }, [docDigits, forcedType]);

  const canSubmit = useMemo(() => canAttemptLogin(docDigits, forcedType), [docDigits, forcedType]);

  function onPressDigit(d: string) {
    setErr("");
    setDocDigits((prev) => {
      if (prev.length >= maxLen) return prev;
      return prev + d;
    });
  }

  function onBackspace() {
    setErr("");
    setDocDigits((prev) => prev.slice(0, -1));
  }

  function onClear() {
    setErr("");
    setDocDigits("");
  }

  function handleBackToCatalog() {
    setErr("");
    setDocDigits("");
    navigate("/catalogo", { replace: true });
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr("");

    const len = docDigits.length;
    if (forcedType === "cpf" && len !== 11) {
      setErr("Este totem está em modo CPF. Volte e selecione CNPJ se for o seu caso.");
      return;
    }
    if (forcedType === "cnpj" && len !== 14) {
      setErr("Este totem está em modo CNPJ. Volte e selecione CPF se for o seu caso.");
      return;
    }

    if (!canAttemptLogin(docDigits, forcedType)) {
      setErr(
        forcedType === "cpf"
          ? "Informe um CPF válido."
          : forcedType === "cnpj"
          ? "Informe um CNPJ válido."
          : "Informe um CPF ou CNPJ válido."
      );
      return;
    }

    setLoading(true);
    try {
      const { data: customer, error } = await supabase
        .from("customers")
        .select("id, name, document, role")
        .eq("document", docDigits)
        .maybeSingle();

      if (error) throw error;

      if (!customer) {
        try {
          localStorage.setItem("prefill_customer_document", docDigits);
        } catch {}
        navigate("/cadastro", { replace: true, state: { document: docDigits } });
        return;
      }

      const sessionToSave = {
        id: customer.id,
        name: customer.name ?? null,
        document: customer.document ?? docDigits,
        role: customer.role ?? "cliente",
      };

      localStorage.setItem("customer_session", JSON.stringify(sessionToSave));
      window.dispatchEvent(new Event("customer_session_changed"));

      navigate("/catalogo", { replace: true });
    } catch (error: any) {
      setErr(error?.message || "Erro inesperado. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  const keyTap = {
    whileTap: { scale: 0.97 },
    whileHover: { scale: 1.01 },
    transition: { type: "spring", stiffness: 500, damping: 30 },
  } as const;

  const labelText = forcedType === "cpf" ? "CPF" : forcedType === "cnpj" ? "CNPJ" : "CPF ou CNPJ";
  const subText =
    forcedType === "cpf"
      ? "Digite seu CPF para continuar"
      : forcedType === "cnpj"
      ? "Digite seu CNPJ para continuar"
      : "Digite seu CPF ou CNPJ para continuar";

  return (
    <Screen>
      {loading && (
        <LoadingOverlay aria-label="Carregando login">
          <Frame>
            <Center>
              <Dot3 />
              <Dot2 />
              <Dot1 />
            </Center>
            <LoadingText>Verificando seu acesso...</LoadingText>
          </Frame>
        </LoadingOverlay>
      )}

      <BackButton aria-label="Voltar para o catálogo" onClick={handleBackToCatalog} title="Voltar">
        <svg viewBox="0 0 24 24" fill="none">
          <path
            d="M15 18l-6-6 6-6"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </BackButton>

      <StyledCard>
        <LogoWrapper>
          <LogoImg
            src={logo}
            alt="Logo da empresa"
            onError={(e) => {
              (e.target as HTMLImageElement).src = "/fallback_logo.png";
            }}
          />
        </LogoWrapper>

        <Title>Identificação</Title>
        <Subtitle>{subText}</Subtitle>

        <Form onSubmit={handleSubmit} noValidate>
          <Field>
            <Label htmlFor="doc">{labelText}</Label>

            <InputShell>
              <InputIcon aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <path
                    d="M8 7.5h8M8 11h8M8 14.5h5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <path
                    d="M7.5 3.5h9A3 3 0 0 1 19.5 6.5v11A3 3 0 0 1 16.5 20.5h-9A3 3 0 0 1 4.5 17.5v-11A3 3 0 0 1 7.5 3.5z"
                    stroke="currentColor"
                    strokeWidth="2"
                    opacity="0.6"
                  />
                </svg>
              </InputIcon>

              <NeumorphicInput
                id="doc"
                name="doc"
                inputMode="none"
                autoComplete="off"
                placeholder="Toque nos números abaixo"
                value={masked}
                readOnly
                aria-invalid={!!err}
                aria-describedby={err ? "doc-error" : undefined}
                disabled={loading}
              />
            </InputShell>

            <Helper>
              {forcedType === "cpf"
                ? "Somente CPF neste modo."
                : forcedType === "cnpj"
                ? "Somente CNPJ neste modo."
                : "Use o teclado abaixo."}
            </Helper>
            {err && <ErrorMsg id="doc-error">{err}</ErrorMsg>}
          </Field>

          <KeypadWrap aria-label="Teclado numérico">
            <KeypadGrid>
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((n) => (
                <KeyButton
                  key={n}
                  type="button"
                  onClick={() => onPressDigit(n)}
                  disabled={loading || docDigits.length >= maxLen}
                  {...keyTap}
                >
                  {n}
                </KeyButton>
              ))}
            </KeypadGrid>

            <KeyRow>
              <MiniKey
                type="button"
                onClick={onClear}
                disabled={loading || docDigits.length === 0}
                $variant="ghost"
                {...keyTap}
              >
                Limpar
              </MiniKey>

              <KeyButton
                type="button"
                onClick={() => onPressDigit("0")}
                disabled={loading || docDigits.length >= maxLen}
                {...keyTap}
              >
                0
              </KeyButton>

              <MiniKey
                type="button"
                onClick={onBackspace}
                disabled={loading || docDigits.length === 0}
                $variant="danger"
                {...keyTap}
                aria-label="Apagar"
                title="Apagar"
              >
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M21 12H9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                  <path
                    d="M9 6l-6 6 6 6"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Apagar
              </MiniKey>
            </KeyRow>
          </KeypadWrap>

          <PrimaryButton type="submit" disabled={loading || !canSubmit}>
            Entrar
          </PrimaryButton>

          <Divider />

          <ActionsRow>
            <ActionButton
              type="button"
              $variant="gold"
              onClick={() => navigate("/cadastro")}
              disabled={loading}
              aria-label="Ir para cadastro"
              title="Cadastrar novo usuário"
            >
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M4 20c0-3.6 3.6-6 8-6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <path d="M19 11v6M16 14h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              Cadastrar
            </ActionButton>

            <ActionButton
              type="button"
              $variant="ghost"
              onClick={onClear}
              disabled={loading || docDigits.length === 0}
              aria-label="Limpar documento"
              title="Limpar"
            >
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
              Limpar
            </ActionButton>
          </ActionsRow>
        </Form>
      </StyledCard>
    </Screen>
  );
};

export default Login;
