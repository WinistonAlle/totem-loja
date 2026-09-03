import { describe, it, expect, vi } from "vitest";
import { reconcilePaidOrders } from "./pull-from-pdv";

function makePdvSupabase(vendas: unknown[]) {
  const not = vi.fn().mockResolvedValue({ data: vendas, error: null });
  const select = vi.fn(() => ({ not }));
  const from = vi.fn(() => ({ select }));
  return { client: { from } as any, from, select, not };
}

function makeTotemSupabase() {
  const is = vi.fn().mockResolvedValue({ error: null });
  const eq = vi.fn(() => ({ is }));
  const update = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ update }));
  return { client: { from } as any, from, update, eq, is };
}

describe("reconcilePaidOrders", () => {
  it("fecha no totem usando o numero do CIGAM (erp_external_id), nao o order_number interno do PDV", async () => {
    const venda = {
      totem_order_number: "GM-20260903-000001",
      order_number: "PDV-1756900000-abc12345",
      erp_external_id: "015046",
      nota_fiscal: "56789"
    };
    const pdv = makePdvSupabase([venda]);
    const totem = makeTotemSupabase();

    const resultado = await reconcilePaidOrders(totem.client, pdv.client);

    expect(resultado).toEqual({ fechados: 1, erros: 0 });

    expect(pdv.from).toHaveBeenCalledWith("orders");
    expect(pdv.select).toHaveBeenCalledWith("totem_order_number, order_number, erp_external_id, nota_fiscal");
    expect(pdv.not).toHaveBeenCalledWith("totem_order_number", "is", null);

    expect(totem.from).toHaveBeenCalledWith("orders");
    expect(totem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        pdv_order_number: "015046",
        pdv_nota_fiscal: "56789",
        paid_at: expect.any(String)
      })
    );
    expect(totem.eq).toHaveBeenCalledWith("order_number", "GM-20260903-000001");
    expect(totem.is).toHaveBeenCalledWith("paid_at", null);
  });

  it("usa order_number do PDV como reserva quando o CIGAM ainda não devolveu número", async () => {
    const venda = {
      totem_order_number: "GM-20260903-000004",
      order_number: "PDV-1756900001-def67890",
      erp_external_id: null,
      nota_fiscal: null
    };
    const pdv = makePdvSupabase([venda]);
    const totem = makeTotemSupabase();

    await reconcilePaidOrders(totem.client, pdv.client);

    expect(totem.update).toHaveBeenCalledWith(
      expect.objectContaining({ pdv_order_number: "PDV-1756900001-def67890" })
    );
  });

  it("retorna {fechados: 0, erros: 0} e não chama update quando não há vendas no PDV", async () => {
    const pdv = makePdvSupabase([]);
    const totem = makeTotemSupabase();

    const resultado = await reconcilePaidOrders(totem.client, pdv.client);

    expect(resultado).toEqual({ fechados: 0, erros: 0 });
    expect(totem.update).not.toHaveBeenCalled();
  });

  it("conta erro e continua quando o update no totem falha, sem lançar exceção", async () => {
    const venda = {
      totem_order_number: "GM-20260903-000002",
      order_number: "PDV-1756900002-ghi11111",
      erp_external_id: "015050",
      nota_fiscal: null
    };
    const pdv = makePdvSupabase([venda]);
    const totem = makeTotemSupabase();
    totem.is.mockResolvedValueOnce({ error: { message: "boom" } });

    const resultado = await reconcilePaidOrders(totem.client, pdv.client);

    expect(resultado).toEqual({ fechados: 0, erros: 1 });
  });
});
