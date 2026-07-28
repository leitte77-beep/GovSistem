import { describe, expect, it } from "vitest";

function formatarDataISO(dataISO: string): string {
  try {
    const d = new Date(dataISO);
    if (isNaN(d.getTime())) return dataISO;
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return dataISO;
  }
}

function formatarHoraISO(dataISO: string): string {
  try {
    const d = new Date(dataISO);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function removerAcentos(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function diasAtras(dataISO: string): string {
  try {
    const agora = new Date("2026-07-20T12:00:00Z");
    const data = new Date(dataISO);
    if (isNaN(data.getTime())) return "";
    const diff = Math.floor((agora.getTime() - data.getTime()) / (1000 * 60 * 60 * 24));
    if (diff === 0) return "Hoje";
    if (diff === 1) return "Ontem";
    return `Há ${diff} dias`;
  } catch {
    return "";
  }
}

function estaNoPeriodo(dataISO: string, inicio: string, fim: string): boolean {
  const d = new Date(dataISO);
  d.setHours(0, 0, 0, 0);
  const i = new Date(inicio);
  i.setHours(0, 0, 0, 0);
  const f = new Date(fim);
  f.setHours(23, 59, 59, 999);
  return d >= i && d <= f;
}

describe("HistoricoAtendimentos helpers", () => {
  describe("formatarDataISO", () => {
    it("formats ISO date to pt-BR", () => {
      const result = formatarDataISO("2026-07-15T14:01:00Z");
      expect(result).toMatch(/15\/07\/2026/);
    });

    it("handles invalid date gracefully", () => {
      const result = formatarDataISO("invalid");
      expect(result).toBe("invalid");
    });
  });

  describe("formatarHoraISO", () => {
    it("formats ISO time to pt-BR", () => {
      const result = formatarHoraISO("2026-07-15T14:01:00Z");
      expect(result).toBeTruthy();
    });

    it("returns empty string for invalid date", () => {
      const result = formatarHoraISO("invalid");
      expect(result).toBe("");
    });
  });

  describe("removerAcentos", () => {
    it("removes accents from text", () => {
      expect(removerAcentos("Atendimento")).toBe("Atendimento");
      expect(removerAcentos("Psicólogo")).toBe("Psicologo");
      expect(removerAcentos("João")).toBe("Joao");
    });

    it("handles text without accents", () => {
      expect(removerAcentos("PAIF")).toBe("PAIF");
    });
  });

  describe("diasAtras", () => {
    it('returns "Hoje" for same day', () => {
      expect(diasAtras("2026-07-20T10:00:00Z")).toBe("Hoje");
    });

    it('returns "Ontem" for previous day', () => {
      expect(diasAtras("2026-07-19T10:00:00Z")).toBe("Ontem");
    });

    it('returns "Há X dias" for older dates', () => {
      expect(diasAtras("2026-07-15T10:00:00Z")).toBe("Há 5 dias");
    });

    it("handles invalid dates gracefully", () => {
      expect(diasAtras("invalid")).toBe("");
    });
  });

  describe("estaNoPeriodo", () => {
    it("returns true when date is within period", () => {
      expect(estaNoPeriodo("2026-07-15T14:01:00Z", "2026-07-01", "2026-07-31")).toBe(true);
    });

    it("returns false when date is before period", () => {
      expect(estaNoPeriodo("2026-06-30T14:01:00Z", "2026-07-01", "2026-07-31")).toBe(false);
    });

    it("returns false when date is after period", () => {
      expect(estaNoPeriodo("2026-08-01T14:01:00Z", "2026-07-01", "2026-07-31")).toBe(false);
    });

    it("includes boundary dates", () => {
      expect(estaNoPeriodo("2026-07-01T00:00:00Z", "2026-07-01", "2026-07-31")).toBe(true);
      expect(estaNoPeriodo("2026-07-31T23:59:59Z", "2026-07-01", "2026-07-31")).toBe(true);
    });

    it("handles single day period", () => {
      expect(estaNoPeriodo("2026-07-15T10:00:00Z", "2026-07-15", "2026-07-15")).toBe(true);
      expect(estaNoPeriodo("2026-07-16T10:00:00Z", "2026-07-15", "2026-07-15")).toBe(false);
    });
  });

  describe("search with removerAcentos", () => {
    it("ignores case in search", () => {
      const termo = removerAcentos("PAIF").toLowerCase();
      const campo = "paif";
      expect(campo.includes(termo)).toBe(true);
    });

    it("ignores accents in search", () => {
      const termo = removerAcentos("Psicologo").toLowerCase();
      const campo = removerAcentos("Psicólogo").toLowerCase();
      expect(campo.includes(termo)).toBe(true);
    });

    it("allows partial match", () => {
      const termo = removerAcentos("psico").toLowerCase();
      const campo = removerAcentos("Psicólogo").toLowerCase();
      expect(campo.includes(termo)).toBe(true);
    });
  });
});
