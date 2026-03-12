import React, { useEffect, useMemo, useState } from "react";
import styled, { keyframes } from "styled-components";
import { X, Minus, Plus, ShoppingCart, Package, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

type Product = {
  id?: string;
  name: string;
  image?: string;
  price?: number; // R$
  price_cents?: number; // cents
  description?: string;
  category?: string;
  weight_kg?: number;
  unit_label?: string; // "kg", "un", etc (opcional)
};

type Props = {
  open: boolean;
  product: Product | null;
  onClose: () => void;

  // Integração com seu carrinho (você conecta do jeito que já usa)
  onAddToCart?: (product: Product, qty: number) => void;

  // opcional: já iniciar com qty diferente
  initialQty?: number;
};

const fadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

const popIn = keyframes`
  from { transform: translateY(10px) scale(0.98); opacity: 0; }
  to { transform: translateY(0px) scale(1); opacity: 1; }
`;

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 9999;
  animation: ${fadeIn} 140ms ease-out;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(8px);

  display: flex;
  align-items: center;
  justify-content: center;

  padding: 16px;

  @media (max-width: 420px) {
    padding: 10px;
  }
`;

const Modal = styled.div`
  width: min(980px, 100%);
  max-height: min(92dvh, 920px);
  overflow: hidden;

  border-radius: 18px;
  background: #fff;
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.25);

  animation: ${popIn} 160ms ease-out;

  display: grid;
  grid-template-columns: 1.15fr 0.85fr;

  @media (max-width: 880px) {
    grid-template-columns: 1fr;
    max-height: 92dvh;
  }
`;

const ImgWrap = styled.div`
  background: #f3f4f6;
  position: relative;

  display: flex;
  align-items: center;
  justify-content: center;

  min-height: 360px;

  @media (max-width: 880px) {
    min-height: 260px;
  }
`;

const BigImg = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;

  /* deixa bem “retail” */
  transform: scale(1.01);
`;

const TopBar = styled.div`
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 2;
`;

const CloseBtn = styled.button`
  height: 38px;
  width: 38px;
  border-radius: 12px;
  border: 0;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  background: rgba(255, 255, 255, 0.85);
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.18);

  &:hover {
    background: rgba(255, 255, 255, 0.95);
  }
`;

const Right = styled.div`
  padding: 18px 18px 16px 18px;
  overflow: auto;

  @media (max-width: 880px) {
    padding: 14px;
  }
`;

const Title = styled.h2`
  margin: 0;
  font-size: 22px;
  line-height: 1.15;
  letter-spacing: -0.2px;
  color: #111827;
`;

const Sub = styled.div`
  margin-top: 6px;
  font-size: 13px;
  color: #6b7280;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
`;

const Badge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;

  padding: 6px 10px;
  border-radius: 999px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
`;

const Price = styled.div`
  margin-top: 14px;
  font-size: 26px;
  font-weight: 800;
  color: #111827;
`;

const Desc = styled.p`
  margin: 12px 0 0 0;
  font-size: 14px;
  line-height: 1.55;
  color: #374151;
  white-space: pre-wrap;
`;

const QtyRow = styled.div`
  margin-top: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
`;

const QtyControls = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 10px;

  padding: 8px 10px;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  background: #fff;
`;

const QtyBtn = styled.button`
  height: 36px;
  width: 36px;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  background: #fff;
  cursor: pointer;

  display: inline-flex;
  align-items: center;
  justify-content: center;

  &:hover {
    background: #f9fafb;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const QtyValue = styled.div`
  min-width: 44px;
  text-align: center;
  font-weight: 700;
  color: #111827;
`;

function formatPriceBRL(product: Product): string {
  const cents =
    typeof product.price_cents === "number"
      ? product.price_cents
      : typeof product.price === "number"
      ? Math.round(product.price * 100)
      : 0;

  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export default function ProductRetailModal({
  open,
  product,
  onClose,
  onAddToCart,
  initialQty = 1,
}: Props) {
  const [qty, setQty] = useState(initialQty);

  useEffect(() => {
    if (open) setQty(initialQty);
  }, [open, initialQty]);

  // ESC fecha
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const safe = useMemo(() => product ?? null, [product]);
  if (!open || !safe) return null;

  const img =
    safe.image ||
    "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1400&q=70";

  const canDec = qty > 1;

  return (
    <Overlay
      onMouseDown={(e) => {
        // clique fora fecha
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <Modal onMouseDown={(e) => e.stopPropagation()}>
        <ImgWrap>
          <TopBar>
            <CloseBtn onClick={onClose} aria-label="Fechar">
              <X size={18} />
            </CloseBtn>
          </TopBar>

          <BigImg src={img} alt={safe.name} />
        </ImgWrap>

        <Right>
          <Title>{safe.name}</Title>

          <Sub>
            {safe.category ? <Badge>{safe.category}</Badge> : null}
            {typeof safe.weight_kg === "number" ? (
              <Badge>
                <Scale size={16} />
                {safe.weight_kg} kg
              </Badge>
            ) : null}
            <Badge>
              <Package size={16} />
              {safe.unit_label || "Unidade"}
            </Badge>
          </Sub>

          <Price>{formatPriceBRL(safe)}</Price>

          {safe.description ? <Desc>{safe.description}</Desc> : null}

          <Separator style={{ marginTop: 16 }} />

          <QtyRow>
            <QtyControls>
              <QtyBtn
                onClick={() => setQty((v) => Math.max(1, v - 1))}
                disabled={!canDec}
                aria-label="Diminuir"
              >
                <Minus size={18} />
              </QtyBtn>

              <QtyValue>{qty}</QtyValue>

              <QtyBtn
                onClick={() => setQty((v) => v + 1)}
                aria-label="Aumentar"
              >
                <Plus size={18} />
              </QtyBtn>
            </QtyControls>

            <Button
              onClick={() => onAddToCart?.(safe, qty)}
              className="gap-2"
            >
              <ShoppingCart size={18} />
              Adicionar
            </Button>
          </QtyRow>
        </Right>
      </Modal>
    </Overlay>
  );
}
