// src/components/ProductCard.tsx
import React, { useMemo, useState } from "react";
import { Product } from "../types/products";
import { useCart } from "../contexts/CartContext";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Minus, Plus } from "lucide-react";
import ProductImageCarousel from "./ProductImageCarousel";
import { toast } from "./ui/sonner";
import ProductRetailModal from "@/components/ProductRetailModal";
import { resolveProductPrice as resolvePricingValue } from "@/utils/productPricing";
import { getPricingContext } from "@/utils/pricingContext";

/* --------------------------------------------------------
   PRICING CONTEXT (CPF/CNPJ + ATACADO/VAREJO)
-------------------------------------------------------- */
type CustomerType = "cpf" | "cnpj";
type ChannelType = "varejo" | "atacado";

function resolveProductPrice(
  product: any,
  ctx: { customer_type: CustomerType; channel: ChannelType } | null
): number {
  return resolvePricingValue(product, ctx);
}

interface ProductCardProps {
  product: Product;
  hideImages?: boolean;
}

function getRetailImage(p: any): string | undefined {
  if (p?.images?.length) return p.images[0];
  if (p?.image_path) return p.image_path;
  if (p?.image) return p.image;
  return undefined;
}

function formatBRL(value: number) {
  const n = Number(value || 0);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const ProductCard: React.FC<ProductCardProps> = ({ product, hideImages = false }) => {
  const { addToCart, decreaseQuantity, updateQuantity, cartItems } = useCart();

  // ✅ Modal Retail (detalhado)
  const [isRetailOpen, setIsRetailOpen] = useState(false);
  const ctx = getPricingContext();

  // ✅ preço conforme contexto (cpf/cnpj + atacado/varejo)
  const price = useMemo(() => resolveProductPrice(product, ctx), [product, ctx]);

  // ✅ Produto “com preço carimbado” (cart)
  const pricedProduct: Product = useMemo(() => {
    return {
      ...(product as any),
      price,
      employee_price: price,
      customer_price: price,
      retail_price: price,
      wholesale_price: price,
      atacado_price: price,
      varejo_price: price,
    } as Product;
  }, [product, price]);

  const isAvailable = product.inStock !== false;

  const currentItem = cartItems.find((item) => String(item.product.id) === String(product.id));
  const quantity = currentItem?.quantity || 0;

  const stop = (e: any) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
  };

  const handleAdd = (e?: any) => {
    stop(e);
    if (!isAvailable) {
      toast.error("Produto indisponível", {
        description: "Este produto está temporariamente sem estoque.",
      });
      return;
    }
    addToCart(pricedProduct, 1);
  };

  const handleMinus = (e?: any) => {
    stop(e);
    if (quantity <= 0) return;
    decreaseQuantity(product.id);
  };

  const handlePlus = (e?: any) => {
    stop(e);
    if (!isAvailable) return;

    if (quantity > 0) updateQuantity(product.id, quantity + 1);
    else addToCart(pricedProduct, 1);
  };

  const desc = typeof (product as any).description === "string" ? (product as any).description : "";
  const extra = typeof (product as any).extraInfo === "string" ? (product as any).extraInfo : "";

  const retailProduct: any = {
    ...product,
    image: getRetailImage(product),
    price,
    category: product.category,
    description: desc.trim() || extra.trim() || "",
    unit_label: product.isPackage ? "Pacote" : "Unidade",
    weight_kg: (product as any).weight_kg ?? (product as any).weightKg ?? undefined,
  };

  const openDetail = () => setIsRetailOpen(true);

  // ====== MOBILE-FIRST SIZING (deixa 2 colunas no mobile bem “certinhas”) ======
  // - Menos padding interno
  // - Imagem mais “cheia” e consistente
  // - Fonte do título e preço responsivas
  // - Botão/stepper um pouco mais baixo no mobile pra caber melhor
  const cardRadius = "rounded-[22px] sm:rounded-[30px]";
  const contentPad = "p-4 sm:p-5";
  const mediaPad = "p-2 sm:p-3";
  const titleText = "text-[15px] sm:text-[17px]";
  const priceText = "text-[22px] sm:text-[26px]";
  const helperText = "text-[12px] sm:text-[13px]";
  const ctaHeight = "h-12 sm:h-14";
  const ctaIcon = "h-5 w-5 sm:h-6 sm:w-6";

  return (
    <>
      <Card
        data-card
        role="button"
        tabIndex={0}
        onClick={openDetail}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openDetail();
          }
        }}
        className={`
          relative overflow-hidden
          ${cardRadius}
          border border-gray-200
          bg-white
          shadow-[0_10px_26px_rgba(0,0,0,0.06)]
          transition
          hover:shadow-[0_16px_36px_rgba(0,0,0,0.08)]
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/10
          flex flex-col h-full
          ${quantity > 0 ? "ring-1 ring-black/5" : ""}
        `}
      >
        {!hideImages && (
          <div className="relative">
            {/* Área de mídia mais “compacta” no mobile e com borda interna suave */}
            <div className="bg-gray-50">
              <div className={`w-full ${mediaPad}`}>
                <div className="relative w-full overflow-hidden rounded-[16px] sm:rounded-[22px] bg-white border border-gray-100">
                  {/* Mantém proporção boa pra 2 colunas no mobile */}
                  <div className="aspect-[1/1] sm:aspect-[4/3] w-full">
                    {product.images && product.images.length > 0 ? (
                      <ProductImageCarousel
                        images={product.images}
                        productName={product.name}
                        className="w-full h-full object-contain"
                      />
                    ) : product.image_path ? (
                      <img
                        src={product.image_path}
                        alt={product.name}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="w-full h-full grid place-items-center text-gray-400 text-xs sm:text-sm font-semibold">
                        Sem imagem
                      </div>
                    )}
                  </div>

                  {/* tag leve quando tem packageInfo */}
                  {!!product.packageInfo && (
                    <div className="absolute left-2 top-2 sm:left-3 sm:top-3">
                      <span className="px-2.5 py-1 rounded-full bg-black/85 text-white text-[11px] sm:text-[12px] font-extrabold">
                        {product.packageInfo}
                      </span>
                    </div>
                  )}

                  {!isAvailable && (
                    <div className="absolute inset-0 bg-white/82 grid place-items-center">
                      <div className="px-4 py-2 rounded-2xl bg-black text-white text-sm font-extrabold">
                        Sem estoque
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <CardContent className={`${contentPad} flex flex-col flex-1`}>
          <div className="min-w-0">
            <h3
              className={`${titleText} font-extrabold text-gray-900 leading-snug`}
              title={product.name}
            >
              {product.name}
            </h3>

            {/* Se packageInfo já virou “tag” em cima da foto, aqui a gente evita duplicar */}
            {!hideImages && !product.packageInfo ? null : null}
          </div>

          <div className="mt-3 sm:mt-4">
            <div className={`${priceText} font-extrabold text-gray-950 tracking-tight leading-none`}>
              {formatBRL(price)}
            </div>

            {quantity > 0 ? (
              <div className={`mt-1.5 ${helperText} text-gray-500 font-semibold`}>
                No carrinho: <span className="text-gray-900">{quantity}</span>
              </div>
            ) : (
              <div className={`mt-1.5 ${helperText} text-gray-400 font-semibold`}>Toque para detalhes</div>
            )}
          </div>

          <div onPointerDown={stop} onTouchStart={stop} onClick={stop} className="mt-auto pt-3 sm:pt-4">
            <div className="border-t border-gray-100 pt-3 sm:pt-4">
              {isAvailable ? (
                quantity <= 0 ? (
                  <Button
                    type="button"
                    onClick={handleAdd}
                    className={`
                      ${ctaHeight} w-full
                      rounded-3xl
                      bg-black text-white
                      hover:bg-gray-900
                      font-extrabold text-[14px] sm:text-[15px]
                      shadow-md
                    `}
                  >
                    <Plus className={`${ctaIcon} mr-2`} />
                    Adicionar
                  </Button>
                ) : (
                  <div
                    className={`
                      w-full
                      inline-flex items-center justify-between
                      ${ctaHeight}
                      rounded-3xl
                      border border-gray-200
                      bg-white
                      shadow-md
                      overflow-hidden
                    `}
                  >
                    <button
                      type="button"
                      onClick={handleMinus}
                      className="h-full w-12 sm:w-14 grid place-items-center hover:bg-gray-50 active:bg-gray-100"
                      aria-label="Diminuir"
                    >
                      <Minus className={`${ctaIcon} text-gray-900`} />
                    </button>

                    <div className="h-full flex-1 grid place-items-center">
                      <span className="text-[16px] sm:text-[18px] font-extrabold text-gray-900">
                        {quantity}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={handlePlus}
                      className="h-full w-12 sm:w-14 grid place-items-center hover:bg-gray-50 active:bg-gray-100"
                      aria-label="Aumentar"
                    >
                      <Plus className={`${ctaIcon} text-gray-900`} />
                    </button>
                  </div>
                )
              ) : (
                <div className={`${ctaHeight} w-full rounded-3xl bg-gray-100 border border-gray-200 grid place-items-center`}>
                  <span className="text-[13px] sm:text-[14px] font-extrabold text-gray-500">Indisponível</span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {isRetailOpen ? (
        <ProductRetailModal
          open={isRetailOpen}
          product={retailProduct}
          onClose={() => setIsRetailOpen(false)}
          initialQty={quantity > 0 ? quantity : 1}
          onAddToCart={(p: any, qtyToAdd: number) => {
            const safeQty = Math.max(1, Number(qtyToAdd || 1));
            if (!isAvailable) return;

            if (quantity > 0) updateQuantity(product.id, safeQty);
            else addToCart(pricedProduct as any, safeQty);

            setIsRetailOpen(false);
            toast.success("Adicionado ao carrinho", {
              description: `${product.name} • ${safeQty}x`,
            });
          }}
        />
      ) : null}
    </>
  );
};

export default React.memo(ProductCard);
