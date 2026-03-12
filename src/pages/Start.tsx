// src/pages/Start.tsx
import React from "react";
import { useNavigate } from "react-router-dom";
import styled, { keyframes } from "styled-components";
import { Bg } from "@/components/ui/app-surface";

import logoGostinho from "@/images/logoc.png";
import paoImg from "@/images/pao.png";
import paoDeQueijoImg from "@/images/paodequeijo.png";
import biscoitoImg from "@/images/biscoito.png";

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

  @media (max-width: 640px) {
    display: none;
  }
`;

const ImgRight = styled.img`
  position: absolute;
  bottom: -2%;
  right: -20%;
  width: min(865px, 84vw);
  z-index: 2;

  @media (max-width: 640px) {
    display: none;
  }
`;

/* ---------------- Component ---------------- */
export default function Start() {
  const navigate = useNavigate();

  function go() {
    try {
      localStorage.removeItem("pricing_context");
    } catch {}
    navigate("/contexto");
  }

  return (
    <Screen>
      <Content>
        <Top>
          <Logo src={logoGostinho} alt="Gostinho Mineiro" />
        </Top>

        <CenterBlock>
          <PrimaryBtn type="button" onClick={go}>
            Começar
          </PrimaryBtn>
        </CenterBlock>
      </Content>

      <Bottom>
        <ImgLeft src={biscoitoImg} alt="" />
        <ImgCenter src={paoDeQueijoImg} alt="" />
        <ImgRight src={paoImg} alt="" />
      </Bottom>
    </Screen>
  );
}
