import { describe, expect, it } from "vitest";

import { cn, formatCurrency, formatDate, formatFileSize, pct, pctLabel, relativeTime } from "./utils";

describe("formatação", () => {
  it("formata data sem hora e devolve travessão quando ausente", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate("2026-09-17")).toBe("17/09/2026");
  });

  it("formata moeda em real", () => {
    expect(formatCurrency(1234.5)).toContain("1.234,50");
    expect(formatCurrency(null)).toBe("—");
  });

  it("formata tamanho de arquivo", () => {
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(2048)).toBe("2.0 KB");
    expect(formatFileSize(3 * 1024 * 1024)).toBe("3.0 MB");
  });
});

describe("percentual", () => {
  it("limita entre 0 e 100 e tolera nulo", () => {
    expect(pct(150)).toBe(100);
    expect(pct(-10)).toBe(0);
    expect(pct(null)).toBe(0);
    expect(pct("42.5")).toBe(42.5);
  });

  it("rotula sem casa decimal desnecessária", () => {
    expect(pctLabel(50)).toBe("50");
    expect(pctLabel(33.33)).toBe("33.3");
    expect(pctLabel(null)).toBe("0");
  });
});

describe("tempo relativo", () => {
  it("descreve o agora e o passado recente", () => {
    expect(relativeTime(new Date().toISOString())).toBe("agora mesmo");
    expect(relativeTime(new Date(Date.now() - 5 * 60000).toISOString())).toBe("há 5 min");
    expect(relativeTime(new Date(Date.now() - 3 * 3600000).toISOString())).toBe("há 3h");
  });
});

describe("cn", () => {
  it("junta classes e ignora valores falsos", () => {
    expect(cn("a", false, undefined, "b", null)).toBe("a b");
  });
});
