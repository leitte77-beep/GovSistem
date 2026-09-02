import { describe, it, expect } from "vitest";
import {
  formatDate, formatDateTime, formatTime, formatDateLong,
  pluralize, pluralMaterias, pluralItens, pluralEdicoes, pluralAnexos,
} from "@/lib/format";

describe("format (pt-BR)", () => {
  // 2026-09-01 14:05:00 UTC == 11:05 BRT
  const ISO = "2026-09-01T14:05:00Z";

  it("formatDate usa dd/MM/yyyy", () => {
    expect(formatDate(ISO)).toBe("01/09/2026");
    expect(formatDate(null)).toBe("—");
    // data apenas (YYYY-MM-DD) não deve deslocar pelo fuso
    expect(formatDate("2026-09-01")).toBe("01/09/2026");
  });

  it("formatDate nunca troca dia e mês", () => {
    // 15/07/2026 (dia 15, mês 07) jamais pode virar 07/15/2026
    expect(formatDate("2026-07-15")).toBe("15/07/2026");
  });

  it("formatDateTime usa dd/MM/yyyy HH:mm (24h, São Paulo)", () => {
    expect(formatDateTime(ISO)).toBe("01/09/2026 11:05");
  });

  it("formatTime usa HH:mm 24h", () => {
    expect(formatTime(ISO)).toBe("11:05");
  });

  it("formatDateLong escreve por extenso", () => {
    expect(formatDateLong("2026-09-01")).toBe("1º de setembro de 2026");
  });
});

describe("pluralize (pt-BR)", () => {
  it("0 matérias", () => expect(pluralMaterias(0)).toBe("0 matérias"));
  it("1 matéria", () => expect(pluralMaterias(1)).toBe("1 matéria"));
  it("2 matérias", () => expect(pluralMaterias(2)).toBe("2 matérias"));
  it("0 itens / 1 item / 2 itens", () => {
    expect(pluralItens(0)).toBe("0 itens");
    expect(pluralItens(1)).toBe("1 item");
    expect(pluralItens(2)).toBe("2 itens");
  });
  it("edições e anexos", () => {
    expect(pluralEdicoes(1)).toBe("1 edição");
    expect(pluralEdicoes(3)).toBe("3 edições");
    expect(pluralAnexos(2)).toBe("2 anexos");
  });
});
