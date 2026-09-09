import { describe, it, expect } from "vitest";
import { resolveLineChannel, resolveProductPrice } from "./productPricing";

function produtoSalgado(overrides: Record<string, unknown> = {}) {
  return {
    category: "Salgados P/ Fritar",
    isPackage: true,
    weight: 0.5,
    price_cpf_varejo: 10,
    price_cpf_atacado: 7,
    price_cnpj_varejo: 10,
    price_cnpj_atacado: 7,
    ...overrides,
  };
}

function produtoPorPeso(overrides: Record<string, unknown> = {}) {
  return {
    category: "Pães e Massas Doces",
    isPackage: false,
    weight: 1,
    price_cpf_varejo: 20,
    price_cpf_atacado: 15,
    price_cnpj_varejo: 20,
    price_cnpj_atacado: 15,
    ...overrides,
  };
}

describe("resolveLineChannel", () => {
  it("mantém varejo pra salgado frito/assado com menos de 10 pacotes", () => {
    expect(resolveLineChannel(produtoSalgado(), 9)).toBe("varejo");
  });

  it("vira atacado pra salgado frito/assado a partir de 10 pacotes", () => {
    expect(resolveLineChannel(produtoSalgado(), 10)).toBe("atacado");
    expect(resolveLineChannel(produtoSalgado(), 15)).toBe("atacado");
  });

  it("mantém varejo pra categoria por peso com menos de 10kg no total", () => {
    // 1kg por unidade x 9 = 9kg, abaixo do limite
    expect(resolveLineChannel(produtoPorPeso({ weight: 1 }), 9)).toBe("varejo");
  });

  it("vira atacado pra categoria por peso quando o total bate 10kg", () => {
    expect(resolveLineChannel(produtoPorPeso({ weight: 1 }), 10)).toBe("atacado");
    // 0.6kg x 17 = 10.2kg
    expect(resolveLineChannel(produtoPorPeso({ weight: 0.6 }), 17)).toBe("atacado");
  });

  it("não conta peso pra categoria de salgado frito/assado — só pacotes", () => {
    // Peso alto mas poucos pacotes: continua varejo, porque a regra dessa
    // categoria é contagem de pacotes, não kg.
    expect(resolveLineChannel(produtoSalgado({ weight: 5 }), 3)).toBe("varejo");
  });

  it("quantidade zero ou inválida nunca é atacado", () => {
    expect(resolveLineChannel(produtoSalgado(), 0)).toBe("varejo");
    expect(resolveLineChannel(produtoPorPeso(), -1)).toBe("varejo");
  });
});

describe("resolveProductPrice", () => {
  it("usa o preço de varejo (cpf) abaixo do limite", () => {
    expect(resolveProductPrice(produtoSalgado(), 5)).toBe(10);
  });

  it("usa o preço de atacado (cpf) ao cruzar o limite de pacotes", () => {
    expect(resolveProductPrice(produtoSalgado(), 10)).toBe(7);
  });

  it("usa o preço de atacado (cpf) ao cruzar o limite de peso", () => {
    expect(resolveProductPrice(produtoPorPeso({ weight: 1 }), 10)).toBe(15);
  });

  it("cai pro preço base quando o produto não tem tabela explícita de atacado/varejo", () => {
    const produtoSimples = { category: "Outros", isPackage: true, weight: 1, price: 12 };
    expect(resolveProductPrice(produtoSimples, 1)).toBe(12);
    // Sem colunas explícitas de atacado, getChannelBasePrice cai pro preço
    // único disponível mesmo passando do limite.
    expect(resolveProductPrice(produtoSimples, 50)).toBe(12);
  });
});
