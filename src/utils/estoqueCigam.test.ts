import { describe, expect, it } from "vitest";
import { disponivelNoCigam } from "./estoqueCigam";

describe("disponivelNoCigam", () => {
  it("aparece com físico positivo, inclusive fracionado", () => {
    expect(disponivelNoCigam({ estoque_cigam: 12 })).toBe(true);
    expect(disponivelNoCigam({ estoque_cigam: "0.400" })).toBe(true);
  });

  it("some com zero, negativo ou nunca lido", () => {
    expect(disponivelNoCigam({ estoque_cigam: 0 })).toBe(false);
    expect(disponivelNoCigam({ estoque_cigam: -8 })).toBe(false);
    expect(disponivelNoCigam({ estoque_cigam: null })).toBe(false);
    expect(disponivelNoCigam({})).toBe(false);
  });
});
