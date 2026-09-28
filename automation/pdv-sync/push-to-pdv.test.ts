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

  it("item por KG vai em R$/kg, para o caixa cobrar o mesmo que o totem mostrou", () => {
    const order = {
      id: "totem-uuid-3",
      order_number: "GM-20260928-000003",
      customer_name: "Fulana",
      customer_document: "TOTEM-CONSUMIDOR",
      order_items: [
        {
          product_name: "Gostinho Gostoso Coxinha de Frango 30g – Pacote 3kg",
          quantity: 4,
          unit_price_cents: 8085,
          products: { cigam_code: "002003000031", cigam_unit: "KG", weight: 3 }
        }
      ]
    };

    const [item] = buildTotemOrderPayload(order as any).items_json;
    expect(item.unitPrice).toBe(26.95);
    expect(item.packageWeightKg).toBe(3);
    // lineTotal do PDV: quantidade × R$/kg × peso do pacote
    expect(Number((item.quantity * item.unitPrice * item.packageWeightKg!).toFixed(2))).toBe(323.4);
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
        unitPrice: 18.75,
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
