import { describe, it, expect } from "vitest";
import { getRecommendations } from "./recomendacoes";
import type { RecommendationScope } from "@/tipos/dashboard";

const BASE: RecommendationScope = {
  rmaFechado: true,
  diasAteFimDoMes: 15,
  mesAtual: "jul/2026",
  nisPendentes: 0,
  semAtendimento90d: 0,
  agendamentosHoje: 0,
  aniversariantesSemana: 0,
  encaminhamentosPrazo: 0,
};

describe("getRecommendations", () => {
  it("retorna lista vazia quando tudo está em dia", () => {
    expect(getRecommendations(BASE)).toHaveLength(0);
  });

  it("dispara RMA quando não fechado e faltam ≤3 dias", () => {
    const recs = getRecommendations({
      ...BASE,
      rmaFechado: false,
      diasAteFimDoMes: 2,
    });
    expect(recs.find((r) => r.id === "rma_fechamento")).toBeTruthy();
    expect(recs[0].id).toBe("rma_fechamento");
  });

  it("NÃO dispara RMA se já fechado", () => {
    const recs = getRecommendations({
      ...BASE,
      rmaFechado: true,
      diasAteFimDoMes: 1,
    });
    expect(recs.find((r) => r.id === "rma_fechamento")).toBeFalsy();
  });

  it("NÃO dispara RMA se faltam >3 dias", () => {
    const recs = getRecommendations({
      ...BASE,
      rmaFechado: false,
      diasAteFimDoMes: 10,
    });
    expect(recs.find((r) => r.id === "rma_fechamento")).toBeFalsy();
  });

  it("dispara NIS pendente quando há pendências", () => {
    const recs = getRecommendations({ ...BASE, nisPendentes: 5 });
    const r = recs.find((r) => r.id === "nis_pendente");
    expect(r).toBeTruthy();
    expect(r?.title).toContain("5");
  });

  it("dispara sem atendimento 90d", () => {
    const recs = getRecommendations({ ...BASE, semAtendimento90d: 12 });
    expect(recs.find((r) => r.id === "sem_atendimento_90d")).toBeTruthy();
  });

  it("dispara agendamentos de hoje", () => {
    const recs = getRecommendations({ ...BASE, agendamentosHoje: 3 });
    expect(recs.find((r) => r.id === "agendamentos_hoje")).toBeTruthy();
  });

  it("dispara aniversariantes", () => {
    const recs = getRecommendations({ ...BASE, aniversariantesSemana: 4 });
    expect(recs.find((r) => r.id === "aniversariantes")).toBeTruthy();
  });

  it("dispara encaminhamentos com prazo", () => {
    const recs = getRecommendations({ ...BASE, encaminhamentosPrazo: 2 });
    expect(recs.find((r) => r.id === "encaminhamentos_prazo")).toBeTruthy();
  });

  it("ordena por prioridade (RMA > NIS > sem atendimento)", () => {
    const recs = getRecommendations({
      ...BASE,
      rmaFechado: false,
      diasAteFimDoMes: 1,
      nisPendentes: 3,
      semAtendimento90d: 5,
    });
    expect(recs[0].id).toBe("rma_fechamento");
    expect(recs[1].id).toBe("nis_pendente");
    expect(recs[2].id).toBe("sem_atendimento_90d");
  });

  it("usa singular para 1 dia", () => {
    const recs = getRecommendations({
      ...BASE,
      rmaFechado: false,
      diasAteFimDoMes: 1,
    });
    const r = recs.find((r) => r.id === "rma_fechamento");
    expect(r?.title).toContain("1 dia");
    expect(r?.title).not.toContain("dias");
  });
});
