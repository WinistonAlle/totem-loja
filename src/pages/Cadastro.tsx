// src/pages/Cadastro.tsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import styled, { keyframes } from "styled-components";
import { Bg, Card } from "../components/ui/app-surface";
import logo from "../images/logoc.png";
import { supabase } from "@/lib/supabase";
import { useNavigate, useLocation } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Building2,
  Flag,
  Hash,
  Home,
  IdCard,
  Landmark,
  Map,
  MapPin,
  User,
  ShieldCheck,
  X,
  Delete,
  Space as SpaceIcon,
  Keyboard as KeyboardIcon,
} from "lucide-react";

/* =========================================================
   TOTEM SETTINGS
   ✅ MOBILE OK (sem mexer no TOTEM): usamos media query max-width
========================================================= */
type FieldStatus = "none" | "valid" | "invalid";
type KbMode = "numeric" | "alphanum" | "alpha";

/**
 * ✅ Agora VK_HEIGHT usa CSS var:
 * - Totem/desktop: 50dvh
 * - Mobile: ajusta via @media (max-width: 640px) em Screen
 * Assim ContentArea e VirtualKeyboard sempre ficam sincronizados.
 */
const VK_HEIGHT = "var(--gm-vk-h, 50dvh)";

/* ================= PAGE LOCK (sem scroll/bounce) ================= */

const Screen = styled(Bg)`
  position: relative;
  height: 100dvh;
  width: 100%;
  overflow: hidden;

  /* ✅ evita herdar centralização do template/Bg */
  display: block !important;

  overscroll-behavior: none;
  touch-action: none;

  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);

  /* fundo totem */
  background: radial-gradient(
      1100px 600px at 10% 10%,
      rgba(255, 255, 255, 0.14),
      rgba(255, 255, 255, 0) 60%
    ),
    radial-gradient(
      900px 500px at 90% 20%,
      rgba(255, 210, 0, 0.1),
      rgba(255, 255, 255, 0) 60%
    ),
    linear-gradient(180deg, #a41616 0%, #7d1717 100%);

  /* ✅ Default (Totem/Desktop) */
  --gm-vk-h: 50dvh;

  /* ✅ MOBILE: teclado um pouco maior + respiro */
  @media (max-width: 640px) {
    --gm-vk-h: 56dvh;
    padding-top: calc(env(safe-area-inset-top) + 10px);
    padding-bottom: calc(env(safe-area-inset-bottom) + 10px);
  }
`;

/**
 * ✅ FIX DEFINITIVO:
 * - usa inset e varia bottom quando teclado abre
 */
const ContentArea = styled.div<{ $kbVisible: boolean }>`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;

  bottom: ${({ $kbVisible }) => ($kbVisible ? VK_HEIGHT : "0px")};

  width: 100%;
  height: auto;

  padding: 0;
  margin: 0;

  display: block;
`;

/* ================= LOADING (Uiverse 3 dots) ================= */

const LoadingOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 9999;

  background: rgba(20, 0, 0, 0.55);
  backdrop-filter: blur(10px);

  display: flex;
  align-items: center;
  justify-content: center;

  pointer-events: all;
`;

const Frame = styled.div`
  position: relative;
  width: 240px;
  height: 240px;

  @media (max-width: 640px) {
    width: 180px;
    height: 180px;
  }
`;

const Center = styled.div`
  position: absolute;
  width: 240px;
  height: 240px;

  @media (max-width: 640px) {
    width: 180px;
    height: 180px;
  }
`;

const jump1 = keyframes`
  0%, 70% { box-shadow: 2px 2px 3px 2px rgba(0,0,0,0.18); transform: scale(0); }
  100% { box-shadow: 10px 10px 16px 0 rgba(0,0,0,0.28); transform: scale(1); }
`;
const jump2 = keyframes`
  0%, 40% { box-shadow: 2px 2px 3px 2px rgba(0,0,0,0.18); transform: scale(0); }
  100% { box-shadow: 10px 10px 16px 0 rgba(0,0,0,0.28); transform: scale(1); }
`;
const jump3 = keyframes`
  0%, 10% { box-shadow: 2px 2px 3px 2px rgba(0,0,0,0.18); transform: scale(0); }
  100% { box-shadow: 10px 10px 16px 0 rgba(0,0,0,0.28); transform: scale(1); }
`;

const Dot1 = styled.div`
  position: absolute;
  z-index: 3;
  width: 32px;
  height: 32px;
  top: 104px;
  left: 104px;
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
  width: 64px;
  height: 64px;
  top: 88px;
  left: 88px;
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
  width: 96px;
  height: 96px;
  top: 72px;
  left: 72px;
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
  bottom: -56px;
  text-align: center;
  color: rgba(255, 255, 255, 0.92);
  font-weight: 950;
  font-size: 16px;
  letter-spacing: 0.02em;

  @media (max-width: 640px) {
    bottom: -44px;
    font-size: 13px;
  }
`;

/* ================= BOTÃO VOLTAR ================= */

const BackButton = styled.button`
  position: fixed;
  top: calc(14px + env(safe-area-inset-top));
  left: 14px;
  width: 66px;
  height: 66px;
  border-radius: 20px;
  border: 0;
  background: rgba(255, 255, 255, 0.18);
  color: rgba(10, 10, 10, 0.92);
  cursor: pointer;

  display: flex;
  align-items: center;
  justify-content: center;

  backdrop-filter: blur(10px);
  box-shadow: 0 14px 40px rgba(0, 0, 0, 0.28);
  transition: transform 0.12s ease, background 0.2s ease;

  user-select: none;
  -webkit-tap-highlight-color: transparent;
  z-index: 9998;

  &:active {
    transform: scale(0.97);
  }

  svg {
    width: 28px;
    height: 28px;
  }

  /* ✅ MOBILE */
  @media (max-width: 640px) {
    top: calc(10px + env(safe-area-inset-top));
    left: 10px;
    width: 46px;
    height: 46px;
    border-radius: 16px;
    svg {
      width: 22px;
      height: 22px;
    }
  }
`;

/* ================= CARD FULL (SEM MARGEM) ================= */

const Shell = styled(Card)<{ $kbVisible: boolean }>`
  position: absolute;
  inset: 0;
  width: 100% !important;
  height: 100% !important;

  max-width: none !important;
  max-height: none !important;

  padding: 0 !important;
  margin: 0 !important;

  background: rgba(255, 255, 255, 0.96) !important;
  backdrop-filter: blur(10px);
  box-shadow: 0 20px 70px rgba(0, 0, 0, 0.4);

  overflow: hidden;

  border-radius: 26px;

  /* ✅ retrato totem: full-bleed */
  @media (orientation: portrait) {
    border-radius: 0px;
  }

  /* ✅ MOBILE: sempre full-bleed (sem “moldura”) */
  @media (max-width: 640px) {
    border-radius: 0px !important;
    box-shadow: none;
    background: rgba(255, 255, 255, 0.98) !important;
  }
`;

/* ================= LAYOUT ================= */

const Layout = styled.div`
  height: 100%;
  width: 100%;
  display: grid;
  grid-template-columns: 420px 1fr;

  @media (max-width: 1100px) {
    grid-template-columns: 360px 1fr;
  }

  /* ✅ totem retrato: 1 coluna */
  @media (orientation: portrait) {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
  }

  /* ✅ MOBILE: 1 coluna sempre (sem alterar totem) */
  @media (max-width: 640px) {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
  }
`;

const Side = styled.div`
  position: relative;
  padding: 18px;

  background: radial-gradient(
      900px 520px at 10% 10%,
      rgba(255, 255, 255, 0.26),
      rgba(255, 255, 255, 0) 60%
    ),
    linear-gradient(180deg, rgba(184, 38, 38, 0.18), rgba(125, 23, 23, 0.1));

  border-right: 1px solid rgba(0, 0, 0, 0.06);

  display: flex;
  flex-direction: column;
  gap: 12px;

  @media (orientation: portrait) {
    border-right: 0;
    border-bottom: 1px solid rgba(0, 0, 0, 0.06);
    padding: 14px 14px 12px;
  }

  /* ✅ MOBILE: header mais compacto */
  @media (max-width: 640px) {
    border-right: 0;
    border-bottom: 1px solid rgba(0, 0, 0, 0.06);
    padding: 12px 12px 10px;
    gap: 10px;
  }
`;

const SideHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;

  @media (max-width: 640px) {
    gap: 12px;
  }
`;

const LogoImg = styled.img`
  width: 86px;
  height: 56px;
  object-fit: contain;

  @media (max-width: 640px) {
    width: 72px;
    height: 46px;
  }
`;

const SideTitle = styled.h1`
  margin: 0;
  font-size: 1.55rem;
  font-weight: 950;
  color: #1f1f1f;
  letter-spacing: -0.02em;

  @media (max-width: 640px) {
    font-size: 1.15rem;
  }
`;

const SideSubtitle = styled.p`
  margin: 4px 0 0;
  color: rgba(20, 20, 20, 0.62);
  font-size: 1rem;
  font-weight: 650;

  @media (max-width: 640px) {
    font-size: 0.9rem;
    margin-top: 2px;
  }
`;

const SideDivider = styled.div`
  height: 1px;
  background: rgba(0, 0, 0, 0.06);
`;

const Steps = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;

  @media (max-width: 640px) {
    gap: 8px;
  }
`;

const StepPill = styled.div<{ $active?: boolean; $done?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 999px;
  font-weight: 950;
  font-size: 1rem;

  background: ${({ $active, $done }) =>
    $done
      ? "rgba(15, 122, 42, 0.10)"
      : $active
      ? "rgba(184, 38, 38, 0.12)"
      : "rgba(0,0,0,0.06)"};

  border: 1px solid
    ${({ $active, $done }) =>
      $done
        ? "rgba(15, 122, 42, 0.22)"
        : $active
        ? "rgba(184, 38, 38, 0.22)"
        : "rgba(0,0,0,0.08)"};

  color: ${({ $active, $done }) =>
    $done ? "rgba(15, 122, 42, 0.9)" : $active ? "#7d1717" : "rgba(0,0,0,0.74)"};

  @media (max-width: 640px) {
    padding: 8px 10px;
    font-size: 0.92rem;
    gap: 8px;
  }
`;

const StepDot = styled.div<{ $active?: boolean; $done?: boolean }>`
  width: 12px;
  height: 12px;
  border-radius: 999px;
  background: ${({ $active, $done }) =>
    $done ? "rgba(15, 122, 42, 0.95)" : $active ? "#b82626" : "rgba(0,0,0,0.25)"};

  @media (max-width: 640px) {
    width: 10px;
    height: 10px;
  }
`;

const SideTip = styled.div<{ $hide?: boolean }>`
  margin-top: auto;
  display: ${({ $hide }) => ($hide ? "none" : "grid")};
  gap: 10px;

  padding: 14px;
  border-radius: 18px;

  background: rgba(255, 255, 255, 0.78);
  border: 1px solid rgba(0, 0, 0, 0.06);
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.1);

  @media (orientation: portrait) {
    display: none;
  }

  @media (max-width: 640px) {
    display: none;
  }
`;

const TipRow = styled.div`
  display: flex;
  gap: 10px;
  align-items: flex-start;

  svg {
    flex: 0 0 auto;
    margin-top: 2px;
    opacity: 0.9;
  }
`;

const TipText = styled.div`
  display: grid;
  gap: 4px;
`;

const TipTitle = styled.div`
  font-weight: 950;
  color: rgba(20, 20, 20, 0.86);
  font-size: 0.98rem;
`;

const TipSub = styled.div`
  font-weight: 650;
  color: rgba(0, 0, 0, 0.62);
  font-size: 0.92rem;
`;

/* ================= MAIN ================= */

const Main = styled.div`
  position: relative;
  height: 100%;
  display: grid;
  grid-template-rows: 1fr auto;
  min-height: 0;
`;

const MainScroll = styled.div`
  overflow: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;

  padding: 16px 16px 10px;
  min-height: 0;

  @media (max-width: 640px) {
    padding: 12px 12px 10px;
  }
`;

const StickyFooter = styled.div`
  padding: 14px 16px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(10px);

  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;

  @media (max-width: 640px) {
    flex-direction: column;
    align-items: stretch;
    padding: 12px;
  }
`;

/* ================= FORM ================= */

const Form = styled.form`
  display: grid;
  gap: 12px;

  @media (max-width: 640px) {
    gap: 10px;
  }
`;

/* ================= MENSAGENS ================= */

const ErrorMsg = styled.div`
  border-radius: 18px;
  padding: 14px;
  background: rgba(179, 0, 0, 0.06);
  border: 1px solid rgba(179, 0, 0, 0.14);
  color: #8a0000;
  font-weight: 900;
  font-size: 1.06rem;

  @media (max-width: 640px) {
    padding: 12px;
    font-size: 0.98rem;
  }
`;

const SuccessMsg = styled.div`
  border-radius: 18px;
  padding: 14px;
  background: rgba(15, 122, 42, 0.07);
  border: 1px solid rgba(15, 122, 42, 0.14);
  color: #0f7a2a;
  font-weight: 950;
  font-size: 1.06rem;

  @media (max-width: 640px) {
    padding: 12px;
    font-size: 0.98rem;
  }
`;

/* ================= SECTION ================= */

const SectionCard = styled.div`
  border-radius: 22px;
  padding: 14px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(0, 0, 0, 0.06);
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.1);

  display: grid;
  gap: 12px;

  @media (max-width: 640px) {
    padding: 12px;
    border-radius: 18px;
    gap: 10px;
  }
`;

const SectionTitle = styled.h2`
  margin: 0;
  font-size: 1.12rem;
  font-weight: 950;
  color: rgba(25, 25, 25, 0.88);

  @media (max-width: 640px) {
    font-size: 1.02rem;
  }
`;

const SectionSubtitle = styled.p`
  margin: -6px 0 0;
  font-size: 0.98rem;
  color: rgba(0, 0, 0, 0.6);

  @media (max-height: 720px) {
    display: none;
  }

  @media (max-width: 640px) {
    font-size: 0.9rem;
  }
`;

const RequiredLegend = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 16px;

  background: rgba(184, 38, 38, 0.06);
  border: 1px solid rgba(184, 38, 38, 0.14);

  color: rgba(40, 10, 10, 0.78);
  font-weight: 850;
  font-size: 0.96rem;

  span {
    color: #b82626;
    font-weight: 1000;
  }

  @media (max-height: 720px) {
    display: none;
  }

  @media (max-width: 640px) {
    font-size: 0.9rem;
    padding: 10px 12px;
  }
`;

/* ================= FIELDS ================= */

const Field = styled.div`
  display: grid;
  gap: 8px;
  align-content: start;
  min-height: 96px;

  @media (max-width: 640px) {
    min-height: 84px;
    gap: 7px;
  }
`;

const LabelRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 26px;
`;

const Label = styled.label`
  font-size: 1rem;
  color: rgba(20, 20, 20, 0.86);
  font-weight: 950;
  display: inline-flex;
  align-items: center;
  gap: 6px;

  @media (max-width: 640px) {
    font-size: 0.95rem;
  }
`;

const ReqStar = styled.span`
  color: #b82626;
  font-weight: 1000;
`;

const ReqPill = styled.span`
  font-size: 0.82rem;
  font-weight: 950;
  padding: 7px 11px;
  border-radius: 999px;
  background: rgba(184, 38, 38, 0.08);
  border: 1px solid rgba(184, 38, 38, 0.16);
  color: rgba(125, 23, 23, 0.92);
  white-space: nowrap;

  @media (max-width: 640px) {
    font-size: 0.78rem;
    padding: 6px 10px;
  }
`;

const Helper = styled.p`
  margin: 0;
  font-size: 0.9rem;
  color: rgba(0, 0, 0, 0.56);
  line-height: 1.15;

  @media (max-width: 640px) {
    font-size: 0.84rem;
  }
`;

/* ================= ROWS ================= */

const Row2 = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  align-items: stretch;

  @media (orientation: portrait) {
    grid-template-columns: 1fr;
  }

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
    gap: 12px;
  }
`;

const AddressGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 14px;
  align-items: stretch;

  @media (max-width: 1100px) {
    grid-template-columns: repeat(8, minmax(0, 1fr));
  }

  @media (orientation: portrait) {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
    gap: 12px;
  }
`;

const AddressCol = styled.div<{ $span: number; $spanMd?: number }>`
  grid-column: span ${({ $span }) => $span};
  display: grid;
  align-content: start;

  @media (max-width: 1100px) {
    grid-column: span ${({ $spanMd, $span }) => $spanMd ?? $span};
  }

  @media (orientation: portrait) {
    grid-column: auto;
  }

  @media (max-width: 720px) {
    grid-column: auto;
  }
`;

/* ================= INPUT COM ÍCONE + VALIDAÇÃO ================= */

const InputWrap = styled.div<{ $status: FieldStatus }>`
  position: relative;

  svg {
    position: absolute;
    left: 16px;
    top: 50%;
    transform: translateY(-50%);
    width: 22px;
    height: 22px;

    transition: color 120ms ease, opacity 120ms ease;

    color: ${({ $status }) =>
      $status === "valid"
        ? "rgba(15, 122, 42, 0.95)"
        : $status === "invalid"
        ? "rgba(179, 0, 0, 0.92)"
        : "rgba(0, 0, 0, 0.45)"};
    pointer-events: none;
  }

  @media (max-width: 640px) {
    svg {
      left: 14px;
      width: 20px;
      height: 20px;
    }
  }
`;

const NeumorphicInput = styled.input<{ $status?: FieldStatus }>`
  width: 100%;
  outline: none;
  appearance: none;
  -webkit-appearance: none;
  -webkit-tap-highlight-color: transparent;

  background: rgba(248, 248, 248, 0.95);
  font-size: 18px;
  color: rgba(20, 20, 20, 0.92);
  caret-color: #7d1717;

  padding: 16px 18px 16px 54px;
  border-radius: 18px;
  min-height: 64px;

  border: 1px solid
    ${({ $status }) =>
      $status === "valid"
        ? "rgba(15, 122, 42, 0.35)"
        : $status === "invalid"
        ? "rgba(179, 0, 0, 0.32)"
        : "rgba(0, 0, 0, 0.06)"};

  box-shadow: inset 7px 7px 12px rgba(0, 0, 0, 0.06),
    inset -7px -7px 12px rgba(255, 255, 255, 0.92);

  transition: box-shadow 140ms ease, border-color 140ms ease, background 140ms ease, transform 120ms ease;

  &::placeholder {
    color: rgba(0, 0, 0, 0.42);
  }

  &:focus {
    background: rgba(255, 255, 255, 0.98);
    border-color: ${({ $status }) =>
      $status === "invalid"
        ? "rgba(179, 0, 0, 0.45)"
        : $status === "valid"
        ? "rgba(15, 122, 42, 0.45)"
        : "rgba(184, 38, 38, 0.35)"};

    box-shadow: 0 0 0 4px rgba(184, 38, 38, 0.12), inset 7px 7px 12px rgba(0, 0, 0, 0.05),
      inset -7px -7px 12px rgba(255, 255, 255, 0.95);
  }

  &:active {
    transform: scale(0.998);
  }

  @media (max-width: 640px) {
    font-size: 16px;
    min-height: 58px;
    padding: 14px 16px 14px 50px;
    border-radius: 16px;
  }
`;

/* ================= SELETOR CPF/CNPJ ================= */

const SelectType = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;

  @media (orientation: portrait) {
    grid-template-columns: 1fr;
  }

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
    gap: 12px;
  }
`;

const ToggleButton = styled.button<{ active?: boolean }>`
  min-height: 66px;
  border-radius: 18px;
  border: 1px solid rgba(0, 0, 0, 0.07);
  background: ${({ active }) => (active ? "linear-gradient(135deg, #b82626, #7d1717)" : "#fff")};
  color: ${({ active }) => (active ? "#fff" : "rgba(20,20,20,0.84)")};
  font-weight: 950;
  font-size: 1.12rem;
  cursor: pointer;

  box-shadow: ${({ active }) =>
    active ? "0 16px 34px rgba(0, 0, 0, 0.22)" : "0 12px 28px rgba(0,0,0,0.10)"};

  &:active {
    transform: scale(0.99);
  }

  @media (max-width: 640px) {
    min-height: 56px;
    border-radius: 16px;
    font-size: 1.02rem;
  }
`;

/* ================= FOOTER ================= */

const LeftActions = styled.div`
  display: flex;
  gap: 12px;
  align-items: center;

  @media (max-width: 640px) {
    width: 100%;
    justify-content: stretch;
    flex-direction: column;
  }
`;

const RightActions = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;

  @media (max-width: 640px) {
    justify-content: stretch;
    width: 100%;
    flex-direction: column;
  }
`;

const PrimaryButton = styled.button`
  min-height: 72px;
  padding: 0 22px;
  font-size: 1.18rem;
  font-weight: 950;
  border-radius: 18px;
  cursor: pointer;

  background: linear-gradient(135deg, #b82626, #7d1717);
  color: #fff;

  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 18px 38px rgba(0, 0, 0, 0.26);

  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 12px;

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    box-shadow: none;
  }

  @media (max-width: 640px) {
    width: 100%;
    min-height: 58px;
    border-radius: 16px;
    font-size: 1.02rem;
  }
`;

const SecondaryButton = styled.button`
  min-height: 72px;
  padding: 0 20px;
  font-size: 1.14rem;
  font-weight: 950;
  border-radius: 18px;
  cursor: pointer;

  background: rgba(255, 255, 255, 0.94);
  color: rgba(20, 20, 20, 0.88);

  border: 1px solid rgba(0, 0, 0, 0.08);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.1);

  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 12px;

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    box-shadow: none;
  }

  @media (max-width: 640px) {
    width: 100%;
    min-height: 58px;
    border-radius: 16px;
    font-size: 1.0rem;
  }
`;

const GhostLink = styled.button`
  border: 0;
  background: transparent;
  cursor: pointer;
  font-weight: 950;
  color: #7d1717;
  padding: 14px 16px;
  border-radius: 16px;
  font-size: 1.04rem;

  &:active {
    transform: scale(0.99);
  }

  @media (max-width: 640px) {
    width: 100%;
    text-align: center;
    background: rgba(125, 23, 23, 0.06);
    font-size: 0.98rem;
    padding: 12px 14px;
    border-radius: 14px;
  }
`;

/* ================= TECLADO VIRTUAL (FORA DO CARD) ================= */

const VirtualKeyboard = styled.div<{ $visible: boolean }>`
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;

  height: ${VK_HEIGHT};
  z-index: 9990;

  transform: translateY(${({ $visible }) => ($visible ? "0%" : "110%")});
  opacity: ${({ $visible }) => ($visible ? 1 : 0)};
  pointer-events: ${({ $visible }) => ($visible ? "auto" : "none")};
  transition: transform 180ms ease, opacity 180ms ease;

  padding: 14px 14px calc(14px + env(safe-area-inset-bottom));
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(255, 255, 255, 0.99));
  border-top: 1px solid rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(12px);

  box-shadow: 0 -26px 70px rgba(0, 0, 0, 0.2);

  display: flex;
  flex-direction: column;
  min-height: 0;

  @media (max-width: 640px) {
    padding: 10px 10px calc(10px + env(safe-area-inset-bottom));
    box-shadow: 0 -18px 48px rgba(0, 0, 0, 0.18);
  }
`;

const KbTopBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 2px 2px 12px;
  flex: 0 0 auto;

  @media (max-width: 640px) {
    padding-bottom: 10px;
    gap: 10px;
  }
`;

const KbBadge = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 10px;

  padding: 10px 12px;
  border-radius: 999px;
  background: rgba(125, 23, 23, 0.06);
  border: 1px solid rgba(125, 23, 23, 0.12);

  color: rgba(60, 10, 10, 0.78);
  font-weight: 950;
  font-size: 1.02rem;

  svg {
    opacity: 0.85;
  }

  @media (max-width: 640px) {
    font-size: 0.92rem;
    padding: 9px 10px;
    gap: 8px;
  }
`;

const KbTopActions = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;

  @media (max-width: 640px) {
    gap: 8px;
  }
`;

const KbMiniBtn = styled.button`
  height: 46px;
  padding: 0 14px;
  border-radius: 14px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  background: #fff;
  color: rgba(20, 20, 20, 0.86);
  font-weight: 950;
  cursor: pointer;

  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;

  box-shadow: 0 12px 26px rgba(0, 0, 0, 0.1);

  &:active {
    transform: scale(0.99);
  }

  @media (max-width: 640px) {
    height: 40px;
    padding: 0 12px;
    border-radius: 12px;
    font-size: 0.92rem;
    gap: 8px;
  }
`;

const KbGrid = styled.div`
  flex: 1 1 auto;
  min-height: 0;

  display: flex;
  flex-direction: column;
  gap: 10px;

  @media (max-width: 640px) {
    gap: 8px;
  }
`;

const KbRow3 = styled.div`
  flex: 1 1 0;
  min-height: 0;

  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;

  @media (max-width: 640px) {
    gap: 8px;
  }
`;

const KbRow = styled.div`
  flex: 1 1 0;
  min-height: 0;

  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  gap: 10px;

  @media (max-width: 640px) {
    gap: 8px;
  }
`;

const KbKey = styled.button<{ $wide?: boolean; $primary?: boolean }>`
  height: 100%;
  min-height: 56px;
  border-radius: 18px;
  border: 1px solid rgba(0, 0, 0, 0.1);

  background: ${({ $primary }) => ($primary ? "linear-gradient(135deg, #b82626, #7d1717)" : "#fff")};
  color: ${({ $primary }) => ($primary ? "#fff" : "rgba(20,20,20,0.92)")};

  font-weight: 950;
  font-size: 1.28rem;
  cursor: pointer;

  box-shadow: ${({ $primary }) =>
    $primary ? "0 16px 34px rgba(0,0,0,0.20)" : "0 14px 30px rgba(0,0,0,0.10)"};

  grid-column: span ${({ $wide }) => ($wide ? 2 : 1)};

  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;

  user-select: none;
  -webkit-tap-highlight-color: transparent;

  &:active {
    transform: scale(0.99);
  }

  svg {
    width: 22px;
    height: 22px;
  }

  @media (max-width: 640px) {
    min-height: 48px;
    border-radius: 16px;
    font-size: 1.08rem;
    svg {
      width: 20px;
      height: 20px;
    }
  }
`;

/* ================= UTIL ================= */

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

const maskCEP = (v: string) => {
  const d = onlyDigits(v).slice(0, 8);
  return d.replace(/^(\d{5})(\d)/, "$1-$2");
};

function isValidCPF(input: string) {
  const str = onlyDigits(input);
  if (!str || str.length !== 11 || /^(\d)\1+$/.test(str)) return false;

  const calc = (base: string, factor: number) => {
    let sum = 0;
    for (let i = 0; i < base.length; i++) sum += Number(base[i]) * (factor - i);
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };

  const d1 = calc(str.slice(0, 9), 10);
  const d2 = calc(str.slice(0, 10), 11);

  return d1 === Number(str[9]) && d2 === Number(str[10]);
}

function isValidCNPJ(input: string) {
  const cnpj = onlyDigits(input);
  if (!cnpj || cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false;

  const calc = (base: string, weights: number[]) => {
    let sum = 0;
    for (let i = 0; i < weights.length; i++) sum += Number(base[i]) * weights[i];
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };

  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  const d1 = calc(cnpj.slice(0, 12), w1);
  const d2 = calc(cnpj.slice(0, 12) + d1, w2);

  return d1 === Number(cnpj[12]) && d2 === Number(cnpj[13]);
}

/* ================= TIPOS (APIs) ================= */

type ViaCepResp = {
  logradouro?: string;
  complemento?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean;
};

type CnpjWsResp = any;

type Touched = Record<
  | "cpf"
  | "cnpj"
  | "ie"
  | "nome"
  | "cep"
  | "logradouro"
  | "numero"
  | "complemento"
  | "bairro"
  | "cidade"
  | "uf",
  boolean
>;

type ActiveField = {
  key: keyof Touched;
  label: string;
  mode: KbMode;
  get: () => string;
  set: (v: string) => void;
  apply: (raw: string) => string;
  ref: React.RefObject<HTMLInputElement>;
};

/* ================= COMPONENT ================= */

const Cadastro: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation() as any;

  const [docType, setDocType] = useState<"cpf" | "cnpj">("cpf");

  const [cpf, setCpf] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [ie, setIe] = useState("");
  const [nome, setNome] = useState("");

  const [cep, setCep] = useState("");
  const [logradouro, setLogradouro] = useState("");
  const [numero, setNumero] = useState("");
  const [complemento, setComplemento] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");

  const [step, setStep] = useState<0 | 1>(0);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const [touched, setTouched] = useState<Touched>({
    cpf: false,
    cnpj: false,
    ie: false,
    nome: false,
    cep: false,
    logradouro: false,
    numero: false,
    complemento: false,
    bairro: false,
    cidade: false,
    uf: false,
  });

  // refs
  const cpfRef = useRef<HTMLInputElement>(null);
  const nomeRef = useRef<HTMLInputElement>(null);
  const cnpjRef = useRef<HTMLInputElement>(null);
  const ieRef = useRef<HTMLInputElement>(null);

  const cepRef = useRef<HTMLInputElement>(null);
  const numeroRef = useRef<HTMLInputElement>(null);
  const ufRef = useRef<HTMLInputElement>(null);
  const logradouroRef = useRef<HTMLInputElement>(null);
  const bairroRef = useRef<HTMLInputElement>(null);
  const cidadeRef = useRef<HTMLInputElement>(null);
  const complementoRef = useRef<HTMLInputElement>(null);

  // teclado
  const [kbVisible, setKbVisible] = useState(false);
  const [kbMode, setKbMode] = useState<KbMode>("alphanum");
  const [kbShift, setKbShift] = useState(false);

  // ✅ FIX: guarda só a KEY do campo (evita closures antigas no activeField)
  const [activeFieldKey, setActiveFieldKey] = useState<keyof Touched | null>(null);

  const cleanDoc = useMemo(
    () => (docType === "cpf" ? onlyDigits(cpf) : onlyDigits(cnpj)),
    [docType, cpf, cnpj]
  );

  useEffect(() => {
    // ✅ trava scroll + ✅ zera estilos do template (body/#root)
    const root = document.getElementById("root");

    const prev = {
      htmlOverflow: document.documentElement.style.overflow,
      bodyOverflow: document.body.style.overflow,
      bodyPosition: document.body.style.position,
      bodyInset: (document.body.style as any).inset,
      bodyWidth: document.body.style.width,
      htmlBg: document.documentElement.style.background,
      bodyBg: document.body.style.background,

      rootMaxWidth: root?.style.maxWidth ?? "",
      rootPadding: root?.style.padding ?? "",
      rootMargin: root?.style.margin ?? "",
      rootWidth: root?.style.width ?? "",
      rootHeight: root?.style.height ?? "",
      rootDisplay: root?.style.display ?? "",
    };

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    (document.body.style as any).inset = "0";
    document.body.style.width = "100%";

    document.documentElement.style.background = "#7d1717";
    document.body.style.background = "#7d1717";

    // ✅ remove “moldura” do Vite (#root com max-width/padding)
    if (root) {
      root.style.maxWidth = "none";
      root.style.padding = "0";
      root.style.margin = "0";
      root.style.width = "100%";
      root.style.height = "100dvh";
      root.style.display = "block";
    }

    return () => {
      document.documentElement.style.overflow = prev.htmlOverflow;
      document.body.style.overflow = prev.bodyOverflow;
      document.body.style.position = prev.bodyPosition;
      (document.body.style as any).inset = prev.bodyInset;
      document.body.style.width = prev.bodyWidth;
      document.documentElement.style.background = prev.htmlBg;
      document.body.style.background = prev.bodyBg;

      if (root) {
        root.style.maxWidth = prev.rootMaxWidth;
        root.style.padding = prev.rootPadding;
        root.style.margin = prev.rootMargin;
        root.style.width = prev.rootWidth;
        root.style.height = prev.rootHeight;
        root.style.display = prev.rootDisplay;
      }
    };
  }, []);

  // ✅ PREFILL: se veio do login (não cadastrado), já abre com CPF/CNPJ preenchido
  useEffect(() => {
    // não sobrescreve se o usuário já começou a digitar
    if (onlyDigits(cpf).length > 0 || onlyDigits(cnpj).length > 0) return;

    let rawFromState = "";
    try {
      rawFromState = String(location?.state?.document || "");
    } catch {}

    let rawFromStorage = "";
    try {
      rawFromStorage = String(localStorage.getItem("prefill_customer_document") || "");
    } catch {}

    const doc = onlyDigits(rawFromState || rawFromStorage);
    if (!doc) return;

    if (doc.length === 11) {
      setDocType("cpf");
      setCpf(maskCPF(doc));
      setCnpj("");
      setIe("");
      setTouched((p) => ({ ...p, cpf: false, cnpj: false, ie: false }));
    } else if (doc.length === 14) {
      setDocType("cnpj");
      setCnpj(maskCNPJ(doc));
      setCpf("");
      setTouched((p) => ({ ...p, cpf: false, cnpj: false }));
    } else {
      return;
    }

    setStep(0);
    setErr("");
    setOk("");

    // limpa pra não reutilizar em outros cadastros
    try {
      localStorage.removeItem("prefill_customer_document");
    } catch {}

    // opcional: já foca no Nome
    requestAnimationFrame(() => {
      nomeRef.current?.focus({ preventScroll: true });
      nomeRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetMsgs() {
    setErr("");
    setOk("");
  }

  function touch<K extends keyof Touched>(k: K) {
    setTouched((p) => ({ ...p, [k]: true }));
  }

  // status helpers
  const cpfOk = useMemo(() => (docType === "cpf" ? isValidCPF(cpf) : true), [docType, cpf]);
  const cnpjOk = useMemo(() => (docType === "cnpj" ? isValidCNPJ(cnpj) : true), [docType, cnpj]);
  const ieOk = useMemo(() => (docType === "cnpj" ? !!ie.trim() : true), [docType, ie]);
  const nomeOk = useMemo(() => !!nome.trim(), [nome]);
  const cepOk = useMemo(() => onlyDigits(cep).length === 8, [cep]);
  const logradouroOk = useMemo(() => !!logradouro.trim(), [logradouro]);
  const numeroHasValue = useMemo(() => !!numero.trim(), [numero]);
  const bairroOk = useMemo(() => !!bairro.trim(), [bairro]);
  const cidadeOk = useMemo(() => !!cidade.trim(), [cidade]);
  const ufOk = useMemo(() => uf.trim().length === 2, [uf]);

  const statusOf = (key: keyof Touched, ok2: boolean, valuePresent: boolean): FieldStatus => {
    if (!touched[key]) return "none";
    if (!valuePresent) return "invalid";
    return ok2 ? "valid" : "invalid";
  };

  const dadosReady = useMemo(() => {
    if (docType === "cpf") return cpfOk && nomeOk;
    return cnpjOk && ieOk && nomeOk;
  }, [docType, cpfOk, cnpjOk, ieOk, nomeOk]);

  const enderecoReady = useMemo(() => {
    return cepOk && logradouroOk && bairroOk && cidadeOk && ufOk;
  }, [cepOk, logradouroOk, bairroOk, cidadeOk, ufOk]);

  const label = (text: string, required?: boolean) => (
    <Label>
      {text} {required ? <ReqStar>*</ReqStar> : null}
    </Label>
  );

  // APIs
  async function fetchCep() {
    const c = onlyDigits(cep);
    if (c.length !== 8) return;

    setLoading(true);
    resetMsgs();
    try {
      const res = await fetch(`https://viacep.com.br/ws/${c}/json/`);
      const data = (await res.json()) as ViaCepResp;

      if (!res.ok || data?.erro) throw new Error("CEP não encontrado. Confira e tente novamente.");

      setLogradouro(data.logradouro || "");
      setComplemento((prev) => prev || data.complemento || "");
      setBairro(data.bairro || "");
      setCidade(data.localidade || "");
      setUf((data.uf || "").toUpperCase());
      setOk("Endereço preenchido pelo CEP.");
    } catch (e: any) {
      setErr(e?.message || "Erro ao consultar CEP.");
    } finally {
      setLoading(false);
    }
  }

  async function fetchCnpj() {
    const c = onlyDigits(cnpj);
    if (c.length !== 14) return;

    if (!isValidCNPJ(c)) {
      setErr("CNPJ inválido. Confira e tente novamente.");
      return;
    }

    setLoading(true);
    resetMsgs();
    try {
      const res = await fetch(`https://publica.cnpj.ws/cnpj/${c}`);
      const data = (await res.json()) as CnpjWsResp;

      if (!res.ok) {
        const msg =
          (data && (data.message || data.mensagem || data.error)) ||
          "Não foi possível consultar esse CNPJ agora.";
        throw new Error(msg);
      }

      const estab = data?.estabelecimento || {};
      const empresa = data?.empresa || {};

      const razao = empresa?.razao_social || data?.razao_social || "";
      const fantasia = estab?.nome_fantasia || data?.nome_fantasia || "";

      const cepApi = estab?.cep || "";
      const logApi = estab?.logradouro || "";
      const numApi = estab?.numero || "";
      const compApi = estab?.complemento || "";
      const bairroApi = estab?.bairro || "";
      const cidadeApi = estab?.cidade?.nome || estab?.municipio || "";
      const ufApi = estab?.estado?.sigla || estab?.uf || "";

      setNome((fantasia || razao || "").trim() || nome);

      if (cepApi) setCep(maskCEP(String(cepApi)));
      if (logApi) setLogradouro(String(logApi));
      if (numApi) setNumero(String(numApi));
      if (compApi) setComplemento((prev) => prev || String(compApi));
      if (bairroApi) setBairro(String(bairroApi));
      if (cidadeApi) setCidade(String(cidadeApi));
      if (ufApi) setUf(String(ufApi).toUpperCase());

      setOk("Dados preenchidos pelo CNPJ.");
    } catch (e: any) {
      setErr(e?.message || "Erro ao consultar CNPJ.");
    } finally {
      setLoading(false);
    }
  }

  function validateForm() {
    if (docType === "cpf") {
      if (!isValidCPF(cpf)) return "CPF inválido. Confira e tente novamente.";
    } else {
      if (!isValidCNPJ(cnpj)) return "CNPJ inválido. Confira e tente novamente.";
      if (!ie.trim()) return "Informe a Inscrição Estadual.";
    }

    if (!nome.trim()) return "Informe o nome.";
    if (onlyDigits(cep).length !== 8) return "Informe um CEP válido.";
    if (!logradouro.trim()) return "Informe o logradouro.";
    if (!bairro.trim()) return "Informe o bairro.";
    if (!cidade.trim()) return "Informe a cidade.";
    if (!uf.trim() || uf.trim().length !== 2) return "Informe a UF (ex: DF, GO).";

    return "";
  }

  async function checkDuplicateCustomer(): Promise<boolean> {
    const doc = cleanDoc;
    if (!doc) return false;

    const { data, error } = await supabase
      .from("customers")
      .select("id")
      .eq("document_type", docType)
      .eq("document", doc)
      .limit(1);

    if (error) return false;
    return (data?.length ?? 0) > 0;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    resetMsgs();

    setTouched((p) => ({
      ...p,
      cpf: true,
      cnpj: true,
      ie: true,
      nome: true,
      cep: true,
      logradouro: true,
      numero: true,
      complemento: true,
      bairro: true,
      cidade: true,
      uf: true,
    }));

    const v = validateForm();
    if (v) {
      setErr(v);
      return;
    }

    setLoading(true);
    try {
      const exists = await checkDuplicateCustomer();
      if (exists) {
        setErr(
          docType === "cpf"
            ? "Esse CPF já está cadastrado. Toque em “Entrar” para continuar."
            : "Esse CNPJ já está cadastrado. Toque em “Entrar” para continuar."
        );
        return;
      }

      const payload = {
        document_type: docType,
        document: cleanDoc,
        inscricao_estadual: docType === "cnpj" ? ie.trim() : null,
        name: nome.trim(),
        cep: onlyDigits(cep),
        street: logradouro.trim(),
        number: numero.trim() || "S/N",
        complement: complemento.trim() || null,
        neighborhood: bairro.trim(),
        city: cidade.trim(),
        state: uf.trim().toUpperCase(),
        created_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from("customers")
        .insert(payload)
        .select("id, document_type, document, name")
        .single();

      if (error) {
        const msg = String((error as any)?.message || "");
        if (/duplicate|unique/i.test(msg)) {
          setErr(
            docType === "cpf"
              ? "Esse CPF já está cadastrado. Toque em “Entrar” para continuar."
              : "Esse CNPJ já está cadastrado. Toque em “Entrar” para continuar."
          );
          return;
        }
        throw error;
      }

      try {
        localStorage.setItem(
          "customer_session",
          JSON.stringify({
            id: data?.id ?? null,
            document_type: data?.document_type ?? docType,
            document: data?.document ?? cleanDoc,
            name: data?.name ?? nome.trim(),
            created_at: new Date().toISOString(),
          })
        );
      } catch {}

      setOk("Cadastro realizado! Entrando no catálogo...");
      setTimeout(() => {
        navigate("/catalogo", { replace: true });
      }, 650);
    } catch (e: any) {
      setErr(e?.message || "Erro ao salvar cadastro. Tente novamente.");
    } finally {
      setLoading(false);
      setKbVisible(false);
    }
  }

  /* ================= TECLADO: configuração por campo ================= */

  const fieldConfigs = useMemo(() => {
    const numericOnly = (raw: string) => onlyDigits(raw);
    const ufApply = (raw: string) =>
      raw
        .replace(/[^a-zA-ZÀ-ÿ]/g, "")
        .toUpperCase()
        .slice(0, 2);

    const numeroApply = (raw: string) => numericOnly(raw).slice(0, 10);

    return {
      cpf: {
        key: "cpf" as const,
        label: "CPF",
        mode: "numeric" as const,
        get: () => cpf,
        set: setCpf,
        apply: (raw: string) => maskCPF(numericOnly(raw)).slice(0, 14),
        ref: cpfRef,
      },
      cnpj: {
        key: "cnpj" as const,
        label: "CNPJ",
        mode: "numeric" as const,
        get: () => cnpj,
        set: setCnpj,
        apply: (raw: string) => maskCNPJ(numericOnly(raw)).slice(0, 18),
        ref: cnpjRef,
      },
      ie: {
        key: "ie" as const,
        label: "Inscrição Estadual",
        mode: "alphanum" as const,
        get: () => ie,
        set: setIe,
        apply: (raw: string) => raw.slice(0, 32),
        ref: ieRef,
      },
      nome: {
        key: "nome" as const,
        label: "Nome",
        mode: "alphanum" as const,
        get: () => nome,
        set: setNome,
        apply: (raw: string) => raw.slice(0, 80),
        ref: nomeRef,
      },
      cep: {
        key: "cep" as const,
        label: "CEP",
        mode: "numeric" as const,
        get: () => cep,
        set: setCep,
        apply: (raw: string) => maskCEP(numericOnly(raw)).slice(0, 9),
        ref: cepRef,
      },
      numero: {
        key: "numero" as const,
        label: "Número",
        mode: "numeric" as const,
        get: () => numero,
        set: setNumero,
        apply: (raw: string) => numeroApply(raw),
        ref: numeroRef,
      },
      uf: {
        key: "uf" as const,
        label: "UF",
        mode: "alpha" as const,
        get: () => uf,
        set: setUf,
        apply: (raw: string) => ufApply(raw),
        ref: ufRef,
      },
      logradouro: {
        key: "logradouro" as const,
        label: "Logradouro",
        mode: "alphanum" as const,
        get: () => logradouro,
        set: setLogradouro,
        apply: (raw: string) => raw.slice(0, 90),
        ref: logradouroRef,
      },
      bairro: {
        key: "bairro" as const,
        label: "Bairro",
        mode: "alphanum" as const,
        get: () => bairro,
        set: setBairro,
        apply: (raw: string) => raw.slice(0, 60),
        ref: bairroRef,
      },
      cidade: {
        key: "cidade" as const,
        label: "Cidade",
        mode: "alphanum" as const,
        get: () => cidade,
        set: setCidade,
        apply: (raw: string) => raw.slice(0, 60),
        ref: cidadeRef,
      },
      complemento: {
        key: "complemento" as const,
        label: "Complemento",
        mode: "alphanum" as const,
        get: () => complemento,
        set: setComplemento,
        apply: (raw: string) => raw.slice(0, 80),
        ref: complementoRef,
      },
    };
  }, [cpf, cnpj, ie, nome, cep, logradouro, numero, complemento, bairro, cidade, uf]);

  // ✅ sempre pega o config "atual" pelo activeFieldKey
  const activeField: ActiveField | null = useMemo(() => {
    if (!activeFieldKey) return null;
    const cfg = (fieldConfigs as any)[activeFieldKey] as ActiveField | undefined;
    return cfg ?? null;
  }, [activeFieldKey, fieldConfigs]);

  const getConfigByRef = useCallback(() => {
    const all = Object.values(fieldConfigs) as unknown as ActiveField[];
    return (ref: React.RefObject<HTMLInputElement>) => all.find((c) => c.ref === ref) || null;
  }, [fieldConfigs]);

  const registerActiveField = useCallback((field: ActiveField) => {
    setActiveFieldKey(field.key);

    setKbMode(field.mode);
    setKbVisible(true);
    setKbShift(false);

    requestAnimationFrame(() => {
      const el = field.ref.current;
      el?.focus({ preventScroll: true });
      el?.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
    });
  }, []);

  const focusNext = useCallback(() => {
    const order: React.RefObject<HTMLInputElement>[] = [];

    if (step === 0) {
      if (docType === "cpf") order.push(cpfRef, nomeRef);
      else order.push(cnpjRef, nomeRef, ieRef);
    } else {
      order.push(cepRef, numeroRef, ufRef, logradouroRef, bairroRef, cidadeRef, complementoRef);
    }

    const currentRef = activeField?.ref;
    const idx = currentRef ? order.findIndex((r) => r === currentRef) : -1;
    const nextRef = order[idx + 1] ?? order[0];

    const cfg = getConfigByRef()(nextRef);
    if (cfg) registerActiveField(cfg);
    else nextRef?.current?.focus({ preventScroll: true });
  }, [activeField, docType, step, getConfigByRef, registerActiveField]);

  const applyKey = useCallback(
    (k: string) => {
      const field = activeField;
      if (!field) return;

      const current = field.get() || "";
      let raw = current;

      if (k === "__BACKSPACE__") raw = raw.slice(0, -1);
      else if (k === "__CLEAR__") raw = "";
      else if (k === "__SPACE__") raw = raw + " ";
      else if (k === "__NEXT__") {
        focusNext();
        return;
      } else if (k === "__CLOSE__") {
        setKbVisible(false);
        return;
      } else if (k === "__SHIFT__") {
        setKbShift((p) => !p);
        return;
      } else raw = raw + k;

      const nextVal = field.apply(raw);
      field.set(nextVal);

      requestAnimationFrame(() => {
        field.ref.current?.focus({ preventScroll: true });
      });
    },
    [activeField, focusNext]
  );

  // fecha teclado ao clicar fora (exceto inputs)
  useEffect(() => {
    if (!kbVisible) return;

    const onDown = (ev: PointerEvent) => {
      const t = ev.target as HTMLElement | null;
      if (!t) return;
      if (t.closest('[data-virtual-keyboard="1"]')) return;
      if (t.closest("input")) return;
      setKbVisible(false);
    };

    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [kbVisible]);

  const kbTitle = useMemo(() => {
    if (kbMode === "numeric") return "Teclado numérico";
    if (kbMode === "alpha") return "Teclado (UF)";
    return "Teclado alfanumérico";
  }, [kbMode]);

  const alphaRows = useMemo(() => {
    const row1 = ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"];
    const row2 = ["A", "S", "D", "F", "G", "H", "J", "K", "L", "Ç"];
    const row3 = ["Z", "X", "C", "V", "B", "N", "M"];
    const accents = ["Á", "É", "Í", "Ó", "Ú", "Ã", "Õ"];
    const fmt = (s: string) => (kbShift ? s : s.toLowerCase());

    return {
      row1: row1.map(fmt),
      row2: row2.map(fmt),
      row3: row3.map(fmt),
      accents: accents.map(fmt),
    };
  }, [kbShift]);

  const numeric = useMemo(() => {
    return {
      r1: ["1", "2", "3"],
      r2: ["4", "5", "6"],
      r3: ["7", "8", "9"],
      r4: ["0"],
    };
  }, []);

  const alphanumRows = useMemo(() => {
    const nums = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
    const extra = ["-", "/", ".", "@", "&"];
    return { nums, extra };
  }, []);

  return (
    <Screen>
      {loading && (
        <LoadingOverlay aria-label="Carregando cadastro">
          <Frame>
            <Center>
              <Dot3 />
              <Dot2 />
              <Dot1 />
            </Center>
            <LoadingText>Salvando e preenchendo dados...</LoadingText>
          </Frame>
        </LoadingOverlay>
      )}

      <BackButton aria-label="Voltar para o catálogo" onClick={() => navigate("/catalogo")}>
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

      <ContentArea $kbVisible={kbVisible}>
        <Shell $kbVisible={kbVisible}>
          <Layout>
            <Side>
              <SideHeader>
                <LogoImg
                  src={logo}
                  alt="Logo da empresa"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = "/fallback_logo.png";
                  }}
                />
                <div>
                  <SideTitle>Cadastrar</SideTitle>
                  <SideSubtitle>Finalize seu cadastro para fazer pedidos</SideSubtitle>
                </div>
              </SideHeader>

              <SideDivider />

              <Steps>
                <StepPill $active={step === 0} $done={step === 1}>
                  <StepDot $active={step === 0} $done={step === 1} />
                  1) Dados
                </StepPill>

                <StepPill $active={step === 1} $done={false}>
                  <StepDot $active={step === 1} $done={false} />
                  2) Endereço
                </StepPill>
              </Steps>

              <SideTip $hide={kbVisible}>
                <TipRow>
                  <ShieldCheck size={22} />
                  <TipText>
                    <TipTitle>Obrigatórios marcados</TipTitle>
                    <TipSub>Campos com * e “Obrigatório” precisam ser preenchidos.</TipSub>
                  </TipText>
                </TipRow>

                <TipRow>
                  <KeyboardIcon size={22} />
                  <TipText>
                    <TipTitle>Teclado do totem</TipTitle>
                    <TipSub>Toque no campo para abrir o teclado certo automaticamente.</TipSub>
                  </TipText>
                </TipRow>
              </SideTip>
            </Side>

            <Main>
              <MainScroll>
                <Form id="cadastro-form" onSubmit={handleSubmit}>
                  {err && <ErrorMsg>{err}</ErrorMsg>}
                  {ok && <SuccessMsg>{ok}</SuccessMsg>}

                  <RequiredLegend>
                    <span>*</span> = campo obrigatório
                  </RequiredLegend>

                  {step === 0 && (
                    <SectionCard>
                      <div>
                        <SectionTitle>Dados</SectionTitle>
                        <SectionSubtitle>Escolha pessoa/empresa e preencha seus dados principais.</SectionSubtitle>
                      </div>

                      <Field style={{ minHeight: "auto" }}>
                        <LabelRow>
                          <Label>
                            Tipo de cadastro <ReqStar>*</ReqStar>
                          </Label>
                          <ReqPill>Obrigatório</ReqPill>
                        </LabelRow>

                        <SelectType>
                          <ToggleButton
                            type="button"
                            active={docType === "cpf"}
                            onClick={() => {
                              resetMsgs();
                              setDocType("cpf");
                              setCnpj("");
                              setIe("");
                              setTouched((p) => ({ ...p, cnpj: false, ie: false }));
                              if (activeFieldKey === "cnpj" || activeFieldKey === "ie") setActiveFieldKey(null);
                            }}
                          >
                            Pessoa (CPF)
                          </ToggleButton>

                          <ToggleButton
                            type="button"
                            active={docType === "cnpj"}
                            onClick={() => {
                              resetMsgs();
                              setDocType("cnpj");
                              setCpf("");
                              setTouched((p) => ({ ...p, cpf: false }));
                              if (activeFieldKey === "cpf") setActiveFieldKey(null);
                            }}
                          >
                            Empresa (CNPJ)
                          </ToggleButton>
                        </SelectType>

                        <Helper>
                          {docType === "cnpj"
                            ? "Ao sair do CNPJ, tentamos preencher automaticamente."
                            : "Informe seu CPF e nome para continuar."}
                        </Helper>
                      </Field>

                      {docType === "cpf" ? (
                        <Row2>
                          <Field>
                            <LabelRow>
                              {label("CPF", true)}
                              <ReqPill>Obrigatório</ReqPill>
                            </LabelRow>

                            <InputWrap $status={statusOf("cpf", cpfOk, onlyDigits(cpf).length > 0)}>
                              <IdCard />
                              <NeumorphicInput
                                ref={cpfRef}
                                value={cpf}
                                onChange={(e) => setCpf(maskCPF(e.target.value))}
                                onBlur={() => touch("cpf")}
                                onFocus={() => registerActiveField(fieldConfigs.cpf as any)}
                                placeholder="000.000.000-00"
                                inputMode="none"
                                $status={statusOf("cpf", cpfOk, onlyDigits(cpf).length > 0)}
                              />
                            </InputWrap>
                            <Helper>{touched.cpf && !cpfOk ? "CPF inválido." : "\u00A0"}</Helper>
                          </Field>

                          <Field>
                            <LabelRow>
                              {label("Nome", true)}
                              <ReqPill>Obrigatório</ReqPill>
                            </LabelRow>

                            <InputWrap $status={statusOf("nome", nomeOk, !!nome.trim())}>
                              <User />
                              <NeumorphicInput
                                ref={nomeRef}
                                value={nome}
                                onChange={(e) => setNome(e.target.value)}
                                onBlur={() => touch("nome")}
                                onFocus={() => registerActiveField(fieldConfigs.nome as any)}
                                placeholder="Seu nome"
                                inputMode="none"
                                $status={statusOf("nome", nomeOk, !!nome.trim())}
                              />
                            </InputWrap>
                            <Helper>{touched.nome && !nomeOk ? "Informe seu nome." : "\u00A0"}</Helper>
                          </Field>
                        </Row2>
                      ) : (
                        <>
                          <Row2>
                            <Field>
                              <LabelRow>
                                {label("CNPJ", true)}
                                <ReqPill>Obrigatório</ReqPill>
                              </LabelRow>

                              <InputWrap $status={statusOf("cnpj", cnpjOk, onlyDigits(cnpj).length > 0)}>
                                <Building2 />
                                <NeumorphicInput
                                  ref={cnpjRef}
                                  value={cnpj}
                                  onChange={(e) => setCnpj(maskCNPJ(e.target.value))}
                                  onBlur={() => {
                                    touch("cnpj");
                                    fetchCnpj();
                                  }}
                                  onFocus={() => registerActiveField(fieldConfigs.cnpj as any)}
                                  placeholder="00.000.000/0000-00"
                                  inputMode="none"
                                  $status={statusOf("cnpj", cnpjOk, onlyDigits(cnpj).length > 0)}
                                />
                              </InputWrap>
                              <Helper>
                                {touched.cnpj && !cnpjOk
                                  ? "CNPJ inválido."
                                  : "Ao sair do campo, buscamos os dados automaticamente."}
                              </Helper>
                            </Field>

                            <Field>
                              <LabelRow>
                                {label("Nome", true)}
                                <ReqPill>Obrigatório</ReqPill>
                              </LabelRow>

                              <InputWrap $status={statusOf("nome", nomeOk, !!nome.trim())}>
                                <Landmark />
                                <NeumorphicInput
                                  ref={nomeRef}
                                  value={nome}
                                  onChange={(e) => setNome(e.target.value)}
                                  onBlur={() => touch("nome")}
                                  onFocus={() => registerActiveField(fieldConfigs.nome as any)}
                                  placeholder="Razão social / Nome fantasia"
                                  inputMode="none"
                                  $status={statusOf("nome", nomeOk, !!nome.trim())}
                                />
                              </InputWrap>
                              <Helper>{touched.nome && !nomeOk ? "Informe o nome." : "\u00A0"}</Helper>
                            </Field>
                          </Row2>

                          <Row2>
                            <Field>
                              <LabelRow>
                                {label("Inscrição Estadual", true)}
                                <ReqPill>Obrigatório</ReqPill>
                              </LabelRow>

                              <InputWrap $status={statusOf("ie", ieOk, !!ie.trim())}>
                                <Hash />
                                <NeumorphicInput
                                  ref={ieRef}
                                  value={ie}
                                  onChange={(e) => setIe(e.target.value)}
                                  onBlur={() => touch("ie")}
                                  onFocus={() => registerActiveField(fieldConfigs.ie as any)}
                                  placeholder="Inscrição Estadual"
                                  inputMode="none"
                                  $status={statusOf("ie", ieOk, !!ie.trim())}
                                />
                              </InputWrap>
                              <Helper>{touched.ie && !ieOk ? "Obrigatório para empresa." : "\u00A0"}</Helper>
                            </Field>

                            <div />
                          </Row2>
                        </>
                      )}
                    </SectionCard>
                  )}

                  {step === 1 && (
                    <SectionCard>
                      <div>
                        <SectionTitle>Endereço</SectionTitle>
                        <SectionSubtitle>Informe seu endereço. CEP pode preencher automaticamente.</SectionSubtitle>
                      </div>

                      <AddressGrid>
                        <AddressCol $span={4} $spanMd={3}>
                          <Field>
                            <LabelRow>
                              {label("CEP", true)}
                              <ReqPill>Obrigatório</ReqPill>
                            </LabelRow>

                            <InputWrap $status={statusOf("cep", cepOk, onlyDigits(cep).length > 0)}>
                              <MapPin />
                              <NeumorphicInput
                                ref={cepRef}
                                value={cep}
                                onChange={(e) => setCep(maskCEP(e.target.value))}
                                onBlur={() => {
                                  touch("cep");
                                  fetchCep();
                                }}
                                onFocus={() => registerActiveField(fieldConfigs.cep as any)}
                                placeholder="00000-000"
                                inputMode="none"
                                $status={statusOf("cep", cepOk, onlyDigits(cep).length > 0)}
                              />
                            </InputWrap>
                            <Helper>
                              {touched.cep && !cepOk ? "CEP inválido." : "Ao sair do CEP, preenchemos automaticamente."}
                            </Helper>
                          </Field>
                        </AddressCol>

                        <AddressCol $span={4} $spanMd={3}>
                          <Field>
                            <LabelRow>{label("Número (opcional)", false)}</LabelRow>

                            <InputWrap $status={numeroHasValue ? "valid" : "none"}>
                              <Hash />
                              <NeumorphicInput
                                ref={numeroRef}
                                value={numero}
                                onChange={(e) => setNumero(e.target.value)}
                                onBlur={() => touch("numero")}
                                onFocus={() => registerActiveField(fieldConfigs.numero as any)}
                                placeholder="S/N"
                                inputMode="none"
                                $status={numeroHasValue ? "valid" : "none"}
                              />
                            </InputWrap>

                            <Helper>{"\u00A0"}</Helper>
                          </Field>
                        </AddressCol>

                        <AddressCol $span={4} $spanMd={2}>
                          <Field>
                            <LabelRow>
                              {label("UF", true)}
                              <ReqPill>Obrigatório</ReqPill>
                            </LabelRow>

                            <InputWrap $status={statusOf("uf", ufOk, !!uf.trim())}>
                              <Flag />
                              <NeumorphicInput
                                ref={ufRef}
                                value={uf}
                                onChange={(e) => setUf(e.target.value.toUpperCase())}
                                onBlur={() => touch("uf")}
                                onFocus={() => registerActiveField(fieldConfigs.uf as any)}
                                placeholder="DF"
                                maxLength={2}
                                inputMode="none"
                                $status={statusOf("uf", ufOk, !!uf.trim())}
                              />
                            </InputWrap>
                            <Helper>{touched.uf && !ufOk ? "UF inválida." : "\u00A0"}</Helper>
                          </Field>
                        </AddressCol>

                        <AddressCol $span={12} $spanMd={8}>
                          <Field>
                            <LabelRow>
                              {label("Logradouro", true)}
                              <ReqPill>Obrigatório</ReqPill>
                            </LabelRow>

                            <InputWrap $status={statusOf("logradouro", logradouroOk, !!logradouro.trim())}>
                              <Map />
                              <NeumorphicInput
                                ref={logradouroRef}
                                value={logradouro}
                                onChange={(e) => setLogradouro(e.target.value)}
                                onBlur={() => touch("logradouro")}
                                onFocus={() => registerActiveField(fieldConfigs.logradouro as any)}
                                placeholder="Rua, avenida..."
                                inputMode="none"
                                $status={statusOf("logradouro", logradouroOk, !!logradouro.trim())}
                              />
                            </InputWrap>
                            <Helper>{touched.logradouro && !logradouroOk ? "Informe o logradouro." : "\u00A0"}</Helper>
                          </Field>
                        </AddressCol>

                        <AddressCol $span={6} $spanMd={4}>
                          <Field>
                            <LabelRow>
                              {label("Bairro", true)}
                              <ReqPill>Obrigatório</ReqPill>
                            </LabelRow>

                            <InputWrap $status={statusOf("bairro", bairroOk, !!bairro.trim())}>
                              <Map />
                              <NeumorphicInput
                                ref={bairroRef}
                                value={bairro}
                                onChange={(e) => setBairro(e.target.value)}
                                onBlur={() => touch("bairro")}
                                onFocus={() => registerActiveField(fieldConfigs.bairro as any)}
                                placeholder="Seu bairro"
                                inputMode="none"
                                $status={statusOf("bairro", bairroOk, !!bairro.trim())}
                              />
                            </InputWrap>
                            <Helper>{touched.bairro && !bairroOk ? "Informe o bairro." : "\u00A0"}</Helper>
                          </Field>
                        </AddressCol>

                        <AddressCol $span={6} $spanMd={4}>
                          <Field>
                            <LabelRow>
                              {label("Cidade", true)}
                              <ReqPill>Obrigatório</ReqPill>
                            </LabelRow>

                            <InputWrap $status={statusOf("cidade", cidadeOk, !!cidade.trim())}>
                              <MapPin />
                              <NeumorphicInput
                                ref={cidadeRef}
                                value={cidade}
                                onChange={(e) => setCidade(e.target.value)}
                                onBlur={() => touch("cidade")}
                                onFocus={() => registerActiveField(fieldConfigs.cidade as any)}
                                placeholder="Sua cidade"
                                inputMode="none"
                                $status={statusOf("cidade", cidadeOk, !!cidade.trim())}
                              />
                            </InputWrap>
                            <Helper>{touched.cidade && !cidadeOk ? "Informe a cidade." : "\u00A0"}</Helper>
                          </Field>
                        </AddressCol>

                        <AddressCol $span={12} $spanMd={8}>
                          <Field>
                            <LabelRow>{label("Complemento", false)}</LabelRow>
                            <InputWrap $status="none">
                              <Home />
                              <NeumorphicInput
                                ref={complementoRef}
                                value={complemento}
                                onChange={(e) => setComplemento(e.target.value)}
                                onBlur={() => touch("complemento")}
                                onFocus={() => registerActiveField(fieldConfigs.complemento as any)}
                                placeholder="Apto, bloco, referência..."
                                inputMode="none"
                                $status="none"
                              />
                            </InputWrap>
                            <Helper>{"\u00A0"}</Helper>
                          </Field>
                        </AddressCol>
                      </AddressGrid>
                    </SectionCard>
                  )}
                </Form>
              </MainScroll>

              <StickyFooter>
                <LeftActions>
                  <GhostLink type="button" onClick={() => navigate("/login")}>
                    Já tenho cadastro → Entrar
                  </GhostLink>
                </LeftActions>

                <RightActions>
                  {step === 1 && (
                    <SecondaryButton
                      type="button"
                      onClick={() => {
                        resetMsgs();
                        setStep(0);
                      }}
                    >
                      <ArrowLeft size={20} />
                      Voltar
                    </SecondaryButton>
                  )}

                  {step === 0 ? (
                    <PrimaryButton
                      type="button"
                      disabled={!dadosReady}
                      onClick={() => {
                        setTouched((p) => ({ ...p, cpf: true, cnpj: true, ie: true, nome: true }));
                        resetMsgs();
                        if (!dadosReady) {
                          setErr("Preencha corretamente os dados para avançar.");
                          return;
                        }
                        setStep(1);
                      }}
                    >
                      Continuar <ArrowRight size={20} />
                    </PrimaryButton>
                  ) : (
                    <PrimaryButton form="cadastro-form" type="submit" disabled={!enderecoReady}>
                      Criar cadastro <BadgeCheck size={20} />
                    </PrimaryButton>
                  )}
                </RightActions>
              </StickyFooter>
            </Main>
          </Layout>
        </Shell>
      </ContentArea>

      {/* ================= TECLADO (fixo, fora do card, até o meio) ================= */}
      <VirtualKeyboard $visible={kbVisible} data-virtual-keyboard="1">
        <KbTopBar>
          <KbBadge>
            <KeyboardIcon size={18} />
            {kbTitle}
            {activeField?.label ? ` • ${activeField.label}` : ""}
          </KbBadge>

          <KbTopActions>
            <KbMiniBtn type="button" onClick={() => setKbVisible(false)}>
              <X size={18} /> Fechar
            </KbMiniBtn>
          </KbTopActions>
        </KbTopBar>

        <KbGrid>
          {kbMode === "numeric" && (
            <>
              <KbRow3>
                {numeric.r1.map((k) => (
                  <KbKey key={k} type="button" onClick={() => applyKey(k)}>
                    {k}
                  </KbKey>
                ))}
              </KbRow3>
              <KbRow3>
                {numeric.r2.map((k) => (
                  <KbKey key={k} type="button" onClick={() => applyKey(k)}>
                    {k}
                  </KbKey>
                ))}
              </KbRow3>
              <KbRow3>
                {numeric.r3.map((k) => (
                  <KbKey key={k} type="button" onClick={() => applyKey(k)}>
                    {k}
                  </KbKey>
                ))}
              </KbRow3>
              <KbRow>
                <KbKey type="button" onClick={() => applyKey("0")}>
                  0
                </KbKey>
                <KbKey type="button" onClick={() => applyKey("__BACKSPACE__")}>
                  <Delete size={18} /> Apagar
                </KbKey>
                <KbKey type="button" onClick={() => applyKey("__CLEAR__")}>
                  Limpar
                </KbKey>
              </KbRow>

              <KbRow>
                <KbKey $primary type="button" onClick={() => applyKey("__NEXT__")}>
                  Próximo
                </KbKey>
                <KbKey type="button" onClick={() => applyKey("__CLOSE__")}>
                  Fechar
                </KbKey>
              </KbRow>
            </>
          )}

          {kbMode !== "numeric" && (
            <>
              {kbMode === "alphanum" && (
                <KbRow>
                  {alphanumRows.nums.map((k) => (
                    <KbKey key={k} type="button" onClick={() => applyKey(k)}>
                      {k}
                    </KbKey>
                  ))}
                </KbRow>
              )}

              <KbRow>
                {alphaRows.row1.map((k) => (
                  <KbKey key={k} type="button" onClick={() => applyKey(k)}>
                    {k}
                  </KbKey>
                ))}
              </KbRow>

              <KbRow>
                {alphaRows.row2.map((k) => (
                  <KbKey key={k} type="button" onClick={() => applyKey(k)}>
                    {k}
                  </KbKey>
                ))}
              </KbRow>

              <KbRow>
                <KbKey type="button" onClick={() => applyKey("__SHIFT__")}>
                  {kbShift ? "ABC" : "abc"}
                </KbKey>
                {alphaRows.row3.map((k) => (
                  <KbKey key={k} type="button" onClick={() => applyKey(k)}>
                    {k}
                  </KbKey>
                ))}
              </KbRow>

              <KbRow>
                {alphaRows.accents.map((k) => (
                  <KbKey key={k} type="button" onClick={() => applyKey(k)}>
                    {k}
                  </KbKey>
                ))}
                {kbMode === "alphanum" &&
                  alphanumRows.extra.map((k) => (
                    <KbKey key={k} type="button" onClick={() => applyKey(k)}>
                      {k}
                    </KbKey>
                  ))}
              </KbRow>

              <KbRow>
                <KbKey type="button" onClick={() => applyKey("__BACKSPACE__")}>
                  <Delete size={18} /> Apagar
                </KbKey>
                <KbKey type="button" onClick={() => applyKey("__SPACE__")}>
                  <SpaceIcon size={18} /> Espaço
                </KbKey>
                <KbKey type="button" onClick={() => applyKey("__CLEAR__")}>
                  Limpar
                </KbKey>
              </KbRow>

              <KbRow>
                <KbKey $primary type="button" onClick={() => applyKey("__NEXT__")}>
                  Próximo
                </KbKey>
                <KbKey type="button" onClick={() => applyKey("__CLOSE__")}>
                  Fechar
                </KbKey>
              </KbRow>
            </>
          )}
        </KbGrid>
      </VirtualKeyboard>
    </Screen>
  );
};

export default Cadastro;