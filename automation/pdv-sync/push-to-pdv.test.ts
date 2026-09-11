import { describe, it, expect, vi } from "vitest";
import { buildTotemOrderPayload } from "./push-to-pdv";

describe("buildTotemOrderPayload", () => {
  it("monta os itens em unidade (não KG) direto, sem conversão", () => {
    const order = {
      id: "totem-uuid-1",
      order_number: "GM-20260903-000001",
      customer_name: "Fulano da Silva",
      customer_document: "11122233344",
      order_items: [
        {
          product_name: "Alho Em Creme Tradicional OMG Pote – 200g",
          quantity: 2,
          unit_price_cents: 1200,
          products: { cigam_code: "002001000008", cigam_unit: "UN", weight: 0.2 }
        }
      ]
    };

    const payload = buildTotemOrderPayload(order as any);

    expect(payload.totem_order_id).toBe("totem-uuid-1");
    expect(payload.totem_order_number).toBe("GM-20260903-000001");
    expect(payload.customer_name).toBe("Fulano da Silva");
    expect(payload.price_table).toBe("002");
    expect(payload.items_json).toEqual([
      {
        cigamCode: "002001000008",
        productName: "Alho Em Creme Tradicional OMG Pote – 200g",
        unit: "UN",
        quantity: 2,
        unitPrice: 12
      }
    ]);
  });

  it("marca packageWeightKg para item vendido por KG", () => {
    const order = {
      id: "totem-uuid-2",
      order_number: "GM-20260903-000002",
      customer_name: "Ciclana",
      customer_document: "22233344455",
      order_items: [
        {
          product_name: "Pão de Queijo Forno Quente 25g – Pacote 800g",
          quantity: 1,
          unit_price_cents: 1500,
          products: { cigam_code: "002005000004", cigam_unit: "KG", weight: 0.8 }
        }
      ]
    };

    const payload = buildTotemOrderPayload(order as any);

    expect(payload.items_json).toEqual([
      {
        cigamCode: "002005000004",
        productName: "Pão de Queijo Forno Quente 25g – Pacote 800g",
        unit: "KG",
        quantity: 1,
        unitPrice: 15,
        packageWeightKg: 0.8
      }
    ]);
  });

  it("lança erro se algum item não tem cigam_code", () => {
    const order = {
      id: "totem-uuid-3",
      order_number: "GM-20260903-000003",
      customer_name: "Beltrano",
      customer_document: "33344455566",
      order_items: [
        { product_name: "Produto sem código", quantity: 1, unit_price_cents: 500, products: { cigam_code: null, cigam_unit: "UN", weight: null } }
      ]
    };

    expect(() => buildTotemOrderPayload(order as any)).toThrow(/sem código CIGAM/);
  });
});
