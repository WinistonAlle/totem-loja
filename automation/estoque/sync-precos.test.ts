import { describe, expect, it } from "vitest";
import { calcularAtualizacoesDePreco, indexarPrecos } from "./sync-precos";

const precos = indexarPrecos([
  { Elemento: "002003000031        ", CodigoTabela: "002   ", PrecoUnitario: 26.95 },
  { Elemento: "002003000031        ", CodigoTabela: "003   ", PrecoUnitario: 19.6 },
  { Elemento: "002005000046        ", CodigoTabela: "002   ", PrecoUnitario: 11.2 },
  { Elemento: "002001000005        ", CodigoTabela: "002   ", PrecoUnitario: 0 },
]);

describe("calcularAtualizacoesDePreco", () => {
  it("leva o preço do CIGAM para varejo e atacado, casando código e tabela com espaço", () => {
    const r = calcularAtualizacoesDePreco(
      [{ id: "a", cigam_code: "002003000031", price_cpf_varejo: 24.5, price_cpf_atacado: 18.5 }],
      precos, "002", "003"
    );
    expect(r).toEqual([{ id: "a", price_cpf_varejo: 26.95, price_cpf_atacado: 19.6 }]);
  });

  it("não regrava o que já está igual", () => {
    const r = calcularAtualizacoesDePreco(
      [{ id: "a", cigam_code: "002003000031", price_cpf_varejo: "26.95", price_cpf_atacado: 19.6 }],
      precos, "002", "003"
    );
    expect(r).toEqual([]);
  });

  it("sem linha na tabela, ou com preço zero no CIGAM, mantém o preço do totem", () => {
    const r = calcularAtualizacoesDePreco(
      [
        { id: "a", cigam_code: "002005000046", price_cpf_varejo: 10.2, price_cpf_atacado: 8.6 },
        { id: "b", cigam_code: "002001000005", price_cpf_varejo: 32, price_cpf_atacado: 32 },
      ],
      precos, "002", "003"
    );
    expect(r).toEqual([{ id: "a", price_cpf_varejo: 11.2 }]);
  });
});
