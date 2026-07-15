import { describe, expect, it } from "vitest";
import {
  encaminhamentoAtrasado,
  formatarEspera,
  idadeEmDias,
  minutosDeEspera,
  urgenciaEspera,
} from "@/paginas/agenda/tempo";

const AGORA = new Date("2026-07-10T12:00:00Z");

function isoMinutosAtras(min: number): string {
  return new Date(AGORA.getTime() - min * 60_000).toISOString();
}

function isoDiasAtras(dias: number): string {
  return new Date(AGORA.getTime() - dias * 86_400_000).toISOString();
}

describe("minutosDeEspera", () => {
  it("calcula os minutos decorridos", () => {
    expect(minutosDeEspera(isoMinutosAtras(40), AGORA)).toBe(40);
  });

  it("nunca retorna valor negativo (data no futuro)", () => {
    expect(minutosDeEspera(isoMinutosAtras(-10), AGORA)).toBe(0);
  });

  it("retorna 0 para data inválida", () => {
    expect(minutosDeEspera("data-ruim", AGORA)).toBe(0);
  });
});

describe("formatarEspera", () => {
  it("mostra apenas minutos abaixo de 1 hora", () => {
    expect(formatarEspera(12)).toBe("12 min");
    expect(formatarEspera(59)).toBe("59 min");
  });

  it("mostra horas e minutos a partir de 1 hora", () => {
    expect(formatarEspera(60)).toBe("1 h 00 min");
    expect(formatarEspera(75)).toBe("1 h 15 min");
  });
});

describe("urgenciaEspera", () => {
  it("classifica normal, atenção e crítica", () => {
    expect(urgenciaEspera(10)).toBe("normal");
    expect(urgenciaEspera(30)).toBe("atencao");
    expect(urgenciaEspera(60)).toBe("critica");
  });
});

describe("idadeEmDias", () => {
  it("calcula os dias inteiros decorridos", () => {
    expect(idadeEmDias(isoDiasAtras(40), AGORA)).toBe(40);
    expect(idadeEmDias(isoDiasAtras(0), AGORA)).toBe(0);
  });
});

describe("encaminhamentoAtrasado", () => {
  it("acusa atraso quando pendente além do prazo (30 dias)", () => {
    expect(encaminhamentoAtrasado("PENDENTE", isoDiasAtras(40), AGORA)).toBe(true);
    expect(encaminhamentoAtrasado("ACEITO", isoDiasAtras(31), AGORA)).toBe(true);
  });

  it("não acusa atraso dentro do prazo", () => {
    expect(encaminhamentoAtrasado("PENDENTE", isoDiasAtras(10), AGORA)).toBe(false);
  });

  it("não acusa atraso quando já finalizado", () => {
    expect(encaminhamentoAtrasado("DEVOLVIDO", isoDiasAtras(90), AGORA)).toBe(false);
    expect(encaminhamentoAtrasado("CANCELADO", isoDiasAtras(90), AGORA)).toBe(false);
    expect(encaminhamentoAtrasado("RECUSADO", isoDiasAtras(90), AGORA)).toBe(false);
  });

  it("respeita prazo customizado", () => {
    expect(encaminhamentoAtrasado("PENDENTE", isoDiasAtras(10), AGORA, 7)).toBe(true);
    expect(encaminhamentoAtrasado("PENDENTE", isoDiasAtras(5), AGORA, 7)).toBe(false);
  });
});
