// src/pages/NotFound.tsx
import styled from "styled-components";
import { useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Bg } from "@/components/ui/app-surface";
import { Button } from "@/components/ui/button";

/* --------------------------------------------------------
   SESSION HELPERS
-------------------------------------------------------- */
function safeGetCustomer() {
  try {
    const raw = localStorage.getItem("customer_session");
    if (!raw) return {};
    if (raw.trim().startsWith("{") || raw.trim().startsWith("[")) return JSON.parse(raw);
    return {};
  } catch {
    return {};
  }
}

/* --------------------------------------------------------
   STYLES
-------------------------------------------------------- */
const Wrapper = styled.div`
  min-height: 100dvh;
  width: 100%;
  display: grid;
  place-items: center;
  padding: 24px;

  /* evita scroll lateral e “espaço branco” */
  overflow-x: hidden;
`;

const Card = styled.div`
  width: 100%;
  max-width: 520px;
  border-radius: 24px;
  padding: 32px;
  background: #ffffff;
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
  text-align: center;
  border: 1px solid rgba(0, 0, 0, 0.05);
`;

const Emoji = styled.div`
  font-size: 56px;
  line-height: 1;
  margin-bottom: 12px;
`;

const Title = styled.h1`
  font-size: 48px;
  font-weight: 800;
  letter-spacing: -0.02em;
  margin: 0;
  color: #111;
`;

const Subtitle = styled.p`
  margin: 8px 0 20px;
  color: #555;
  font-size: 16px;
`;

const Muted = styled.p`
  margin-top: 12px;
  font-size: 12px;
  color: #999;

  code {
    color: inherit;
    word-break: break-all;
  }
`;

export default function NotFound() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error("❌ 404:", location.pathname);
  }, [location.pathname]);

  // decide melhor rota “home” dependendo de sessão
  const homeRoute = useMemo(() => {
    const customer = safeGetCustomer();

    // cliente logado -> catálogo
    if (customer?.id || customer?.customer_id || customer?.cpf || customer?.document) return "/catalogo";

    // sem sessão -> login
    return "/login";
  }, []);

  const goHomeLabel = homeRoute === "/login" ? "Ir para o login" : "Voltar para o catálogo";

  return (
    <Bg>
      <Wrapper>
        <Card>
          <Emoji>🧭</Emoji>
          <Title>404</Title>
          <Subtitle>Oops! A página que você procura não foi encontrada.</Subtitle>

          <div className="flex flex-wrap gap-2 justify-center">
            <Button size="lg" className="rounded-full" onClick={() => navigate(homeRoute)}>
              {goHomeLabel}
            </Button>

            <Button
              size="lg"
              variant="outline"
              className="rounded-full"
              onClick={() => navigate("/")}
            >
              Ir para o início
            </Button>
          </div>

          <Muted>
            Rota inválida: <code>{location.pathname}</code>
          </Muted>
        </Card>
      </Wrapper>
    </Bg>
  );
}
