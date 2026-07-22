import { describe, it, expect } from "vitest";
import { dataPorExtensoCurta } from "./datas";

describe("dataPorExtensoCurta", () => {
  it("usa nome completo do dia da semana e mês abreviado com ponto (pt-BR)", () => {
    // 2026-07-22 é uma quarta-feira.
    const r = dataPorExtensoCurta(new Date(2026, 6, 22));
    expect(r).toBe("quarta, 22 de jul. de 2026");
  });

  it("não usa abreviação sem ponto para o dia da semana", () => {
    const r = dataPorExtensoCurta(new Date(2026, 6, 22));
    expect(r).not.toMatch(/^qua,/);
  });
});
