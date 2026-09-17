import { describe, expect, it } from "vitest";

import { fimDoDia, semVazios } from "./demandaForm";

describe("semVazios", () => {
  it("remove string vazia, undefined e null", () => {
    expect(
      semVazios({ titulo: "Obra", tipo_id: "", prazo: undefined, descricao: null }),
    ).toEqual({ titulo: "Obra" });
  });

  it("preserva false como valor, não como ausência", () => {
    expect(semVazios({ rascunho: false, urgente: true })).toEqual({
      rascunho: false,
      urgente: true,
    });
  });

  it("preserva zero", () => {
    expect(semVazios({ valor: 0 })).toEqual({ valor: 0 });
  });
});

describe("fimDoDia", () => {
  it("converte data-only no fim do dia", () => {
    expect(fimDoDia("2026-09-25")).toBe("2026-09-25T23:59:59");
  });

  it("devolve undefined sem data", () => {
    expect(fimDoDia("")).toBeUndefined();
  });
});
