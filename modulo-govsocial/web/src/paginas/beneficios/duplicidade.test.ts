import { describe, expect, it } from "vitest";
import { avaliarDuplicidade } from "@/paginas/beneficios/duplicidade";
import type { ConcessaoListItem } from "@/tipos/beneficios";

function conc(dias: number, status: string, code = "CESTA_BASICA"): ConcessaoListItem {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return {
    id: `c${dias}`,
    family_id: "f1",
    unit_id: "u1",
    benefit_type_code: code,
    status: status as ConcessaoListItem["status"],
    data_solicitacao: d.toISOString(),
    valor_total: null,
  };
}

describe("avaliarDuplicidade", () => {
  it("acusa duplicidade quando há entrega dentro da janela", () => {
    const r = avaliarDuplicidade([conc(12, "ENTREGUE")], "CESTA_BASICA", 30);
    expect(r.duplicado).toBe(true);
    expect(r.diasDesde).toBe(12);
    expect(r.janelaDias).toBe(30);
  });

  it("não acusa quando a concessão está fora da janela", () => {
    const r = avaliarDuplicidade([conc(45, "ENTREGUE")], "CESTA_BASICA", 30);
    expect(r.duplicado).toBe(false);
  });

  it("ignora concessões que não contam (SOLICITADO/NEGADO)", () => {
    const r = avaliarDuplicidade(
      [conc(5, "SOLICITADO"), conc(3, "NEGADO")],
      "CESTA_BASICA",
      30,
    );
    expect(r.duplicado).toBe(false);
  });

  it("sem janela definida, nunca acusa duplicidade", () => {
    const r = avaliarDuplicidade([conc(1, "ENTREGUE")], "AUXILIO_FUNERAL", null);
    expect(r.duplicado).toBe(false);
  });

  it("considera apenas o mesmo tipo de benefício", () => {
    const r = avaliarDuplicidade(
      [conc(2, "ENTREGUE", "AUXILIO_NATALIDADE")],
      "CESTA_BASICA",
      30,
    );
    expect(r.duplicado).toBe(false);
  });
});
