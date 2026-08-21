// automation/cigam/process-pending-orders.test.ts
import { describe, expect, it } from "vitest";
import { buildItens } from "./process-pending-orders";

describe("buildItens", () => {
  it("converte quantidade e preço para material vendido por KG", () => {
    const order = {
      id: "1",
      order_number: "T-0001",
      customer_name: "CLIENTE TESTE",
      payment_method: "attendant",
      erp_external_id: null,
      order_items: [
        {
          product_name: "Pão de Queijo PCT 1KG",
          quantity: 2, // 2 pacotes
          unit_price_cents: 2500, // R$25,00 pelo pacote de 1kg
          products: { cigam_code: "002001000001", cigam_unit: "KG", weight: 1 },
        },
      ],
    };

    const itens = buildItens(order as any);

    expect(itens).toEqual([
      {
        codigoMaterial: "002001000001",
        quantidade: 2, // 2 pacotes * 1kg
        precoUnitario: 25, // R$25/kg (peso=1, preço do pacote = preço/kg)
        unidadeMedida: "KG",
        codigoCentroArmazenagem: "001",
      },
    ]);
  });

  it("mantém quantidade/preço direto para material vendido por UN", () => {
    const order = {
      id: "1",
      order_number: "T-0002",
      customer_name: "CLIENTE TESTE",
      payment_method: "attendant",
      erp_external_id: null,
      order_items: [
        {
          product_name: "Refrigerante Lata UN",
          quantity: 3,
          unit_price_cents: 500,
          products: { cigam_code: "002002000005", cigam_unit: "UN", weight: 0 },
        },
      ],
    };

    const itens = buildItens(order as any);

    expect(itens).toEqual([
      {
        codigoMaterial: "002002000005",
        quantidade: 3,
        precoUnitario: 5,
        unidadeMedida: "UN",
        codigoCentroArmazenagem: "001",
      },
    ]);
  });

  it("lança erro se o produto não tem cigam_code", () => {
    const order = {
      id: "1",
      order_number: "T-0003",
      customer_name: "CLIENTE TESTE",
      payment_method: "attendant",
      erp_external_id: null,
      order_items: [
        {
          product_name: "Produto sem mapeamento",
          quantity: 1,
          unit_price_cents: 100,
          products: { cigam_code: null, cigam_unit: null, weight: null },
        },
      ],
    };

    expect(() => buildItens(order as any)).toThrow("Produto sem código CIGAM");
  });
});
