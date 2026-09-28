import { describe, expect, it } from "vitest";
import { montarAlertas } from "./vigia";

const tranquilo = { falhasDeCheckoutUltimaHora: 0, pedidosComErroDeEnvio: [], pedidosEsperandoCaixa: [], minutosDesdeEstoqueOk: 3 };

describe("montarAlertas", () => {
  it("silêncio quando está tudo bem", () => {
    expect(montarAlertas(tranquilo)).toEqual([]);
  });

  it("avisa checkout recusando e pedido que não chegou ao PDV", () => {
    const a = montarAlertas({ ...tranquilo, falhasDeCheckoutUltimaHora: 3, pedidosComErroDeEnvio: ["GM-1"] });
    expect(a).toHaveLength(2);
    expect(a[0]).toContain("3 tentativa(s)");
    expect(a[1]).toContain("GM-1");
  });

  it("só reclama da fila do caixa depois de 30 minutos", () => {
    expect(montarAlertas({ ...tranquilo, pedidosEsperandoCaixa: [{ numero: "1", cliente: "ANA", minutos: 29 }] })).toEqual([]);
    expect(montarAlertas({ ...tranquilo, pedidosEsperandoCaixa: [{ numero: "1", cliente: "ANA", minutos: 30 }] })[0]).toContain("ANA (30 min)");
  });

  it("estoque parado há 20 minutos vira alerta; nunca rodou ainda não", () => {
    expect(montarAlertas({ ...tranquilo, minutosDesdeEstoqueOk: 20 })[0]).toContain("20 min");
    expect(montarAlertas({ ...tranquilo, minutosDesdeEstoqueOk: null })).toEqual([]);
  });
});
