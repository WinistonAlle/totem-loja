import { describe, expect, it } from "vitest";
import { calcularAtualizacoesDeEstoque } from "./sync-estoque";

const produto = (id: string, cigam_code: string | null, estoque_cigam: number | string | null) => ({ id, cigam_code, estoque_cigam });

describe("calcularAtualizacoesDeEstoque", () => {
  it("grava a primeira leitura e o que mudou", () => {
    const r = calcularAtualizacoesDeEstoque(
      [produto("a", "001", null), produto("b", "002", 5), produto("c", "003", 5)],
      new Map([["001", 12], ["002", 0], ["003", 5]])
    );
    expect(r).toEqual([{ id: "a", estoque_cigam: 12 }, { id: "b", estoque_cigam: 0 }]);
  });

  it("leitura que falhou mantém o último valor bom", () => {
    const r = calcularAtualizacoesDeEstoque(
      [produto("a", "001", 42), produto("b", "002", 7)],
      new Map<string, number | null>([["001", null]])
    );
    expect(r).toEqual([]);
  });

  it("guarda o físico negativo como veio, sem zerar", () => {
    const r = calcularAtualizacoesDeEstoque([produto("a", "001", "3.000")], new Map([["001", -8]]));
    expect(r).toEqual([{ id: "a", estoque_cigam: -8 }]);
  });

  it("casa o código mesmo com espaço sobrando no cadastro", () => {
    const r = calcularAtualizacoesDeEstoque([produto("a", "002003000028  ", 1)], new Map([["002003000028", 4]]));
    expect(r).toEqual([{ id: "a", estoque_cigam: 4 }]);
  });
});
