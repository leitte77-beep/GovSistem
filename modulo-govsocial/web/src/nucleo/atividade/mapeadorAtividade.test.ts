import { describe, it, expect } from "vitest";
import { mapearAtividade, formatarTempoRelativo, formatarTempoAbsoluto } from "./mapeadorAtividade";
import type { DashboardActivityItem } from "@/tipos/dashboard";

const BASE: DashboardActivityItem = {
  id: "act-1",
  texto: "Qualquer coisa",
  descricao: "Detalhe contextual",
  categoria: "atendimento",
  entidade: "atendimento",
  data: new Date(Date.now() - 2 * 3600000).toISOString(),
  acao: "registrado",
  ator: "Maria Técnica",
};

describe("mapearAtividade", () => {
  it("mapeia entidade e ação conhecidos", () => {
    const r = mapearAtividade(BASE);
    expect(r.action).toBe("registrou um atendimento");
  });

  it("usa ator quando presente", () => {
    const r = mapearAtividade(BASE);
    expect(r.actor).toBe("Maria Técnica");
  });

  it("usa 'Sistema' quando ator ausente", () => {
    const r = mapearAtividade({ ...BASE, ator: null });
    expect(r.actor).toBe("Sistema");
  });

  it("NUNCA exibe código cru como action", () => {
    const r = mapearAtividade({ ...BASE, entidade: "rma_fechamento", acao: "consultado" });
    expect(r.action).toBe("visualizou o fechamento do RMA");
    expect(r.action).not.toContain("rma_fechamento");
    expect(r.action).not.toContain("consultado");
  });

  it("fallback para texto quando entidade desconhecida", () => {
    const r = mapearAtividade({ ...BASE, entidade: "xyz_desconhecido", acao: "zzz" });
    expect(r.action).toBe("Qualquer coisa");
  });

  it("mantém descricao como subject", () => {
    const r = mapearAtividade(BASE);
    expect(r.subject).toBe("Detalhe contextual");
  });

  it("usa frase completa com competência para rma_fechamento.consultado", () => {
    const r = mapearAtividade({
      ...BASE,
      entidade: "rma_fechamento",
      acao: "consultado",
      competencia: "jun/2026",
    });
    expect(r.action).toBe("visualizou o fechamento do RMA de jun/2026");
  });

  it("usa frase completa com nome para familia.consultado", () => {
    const r = mapearAtividade({
      ...BASE,
      entidade: "familia",
      acao: "consultado",
      nome: "Família Silva",
    });
    expect(r.action).toBe("consultou a família Família Silva");
    expect(r.action).not.toContain("consultado");
  });

  it("usa fallback sem palavra pendurada quando falta o nome estruturado", () => {
    const r = mapearAtividade({ ...BASE, entidade: "familia", acao: "consultado", nome: null });
    expect(r.action).toBe("consultou uma família");
    expect(r.action).not.toMatch(/\bconsultado\b/);
  });

  it("usa frase completa com nome para prontuario.atualizado", () => {
    const r = mapearAtividade({
      ...BASE,
      entidade: "prontuario",
      acao: "atualizado",
      nome: "Maria Santos",
    });
    expect(r.action).toBe("atualizou o prontuário de Maria Santos");
  });

  it("actor nunca é um role cru como 'ADMIN'", () => {
    const r = mapearAtividade({ ...BASE, ator: "Alisson Leite" });
    expect(r.actor).toBe("Alisson Leite");
    expect(r.actor).not.toBe("ADMIN");
  });

  it("gera rota para RMA", () => {
    const r = mapearAtividade({ ...BASE, entidade: "rma_fechamento" });
    expect(r.to).toBe("/rma");
  });

  it("gera null para entidades sem rota", () => {
    const r = mapearAtividade({ ...BASE, entidade: "atendimento" });
    expect(r.to).toBeNull();
  });
});

describe("formatarTempoRelativo", () => {
  it("mostra 'Agora mesmo' para <1 min", () => {
    const agora = new Date().toISOString();
    expect(formatarTempoRelativo(agora)).toBe("Agora mesmo");
  });

  it("mostra minutos", () => {
    const ha5min = new Date(Date.now() - 5 * 60000).toISOString();
    expect(formatarTempoRelativo(ha5min)).toContain("min");
  });

  it("mostra horas", () => {
    const ha3h = new Date(Date.now() - 3 * 3600000).toISOString();
    expect(formatarTempoRelativo(ha3h)).toContain("h");
  });

  it("mostra 'Ontem'", () => {
    const ontem = new Date(Date.now() - 25 * 3600000).toISOString();
    expect(formatarTempoRelativo(ontem)).toBe("Ontem");
  });
});

describe("formatarTempoAbsoluto", () => {
  it("formata com dia/mes/ano hora:minuto", () => {
    const r = formatarTempoAbsoluto("2026-07-22T10:30:00Z");
    expect(r).toContain("2026");
    expect(r).toContain("22");
    expect(r).toContain("07");
  });
});
