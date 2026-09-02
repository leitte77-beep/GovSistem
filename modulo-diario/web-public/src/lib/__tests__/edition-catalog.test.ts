import { describe, it, expect } from "vitest";
import { matterKind, kindCounts, sectionCounts, slugify } from "../edition-catalog";
import type { MatterMeta } from "../edition-types";

describe("matterKind", () => {
  it("classifies legal act types from the real title text", () => {
    expect(matterKind("PORTARIA – 04/2026")).toBe("portarias");
    expect(matterKind("Decreto nº 88/2026")).toBe("decretos");
    expect(matterKind("LEI COMPLEMENTAR 001/2026")).toBe("leis");
    expect(matterKind("EXTRATO DE CONTRATO Nº 47/2026")).toBe("extratos");
    expect(matterKind("Resolução nº 3/2026")).toBe("resolucoes");
  });

  it("falls back to outros for unrecognized titles", () => {
    expect(matterKind("Ata da sessão ordinária")).toBe("outros");
    expect(matterKind(null)).toBe("outros");
    expect(matterKind("")).toBe("outros");
  });
});

describe("kindCounts", () => {
  const matters: MatterMeta[] = [
    { id: "a", anchorId: "a", position: 0, title: "PORTARIA 1/2026", summary: null, section: null },
    { id: "b", anchorId: "b", position: 1, title: "PORTARIA 2/2026", summary: null, section: null },
    { id: "c", anchorId: "c", position: 2, title: "DECRETO 3/2026", summary: null, section: null },
  ];
  it("counts by kind, always in canonical order", () => {
    const counts = kindCounts(matters);
    expect(counts.find((c) => c.key === "portarias")?.count).toBe(2);
    expect(counts.find((c) => c.key === "decretos")?.count).toBe(1);
  });
});

describe("sectionCounts", () => {
  it("groups by caderno section when present", () => {
    const matters: MatterMeta[] = [
      { id: "a", anchorId: "a", position: 0, title: "X", summary: null, section: "Administração" },
      { id: "b", anchorId: "b", position: 1, title: "Y", summary: null, section: "Administração" },
      { id: "c", anchorId: "c", position: 2, title: "Z", summary: null, section: "Fazenda" },
    ];
    const counts = sectionCounts(matters);
    expect(counts.find((s) => s.label === "Administração")?.count).toBe(2);
    expect(counts.find((s) => s.label === "Fazenda")?.count).toBe(1);
  });
});

describe("slugify", () => {
  it("normalizes accents and separators", () => {
    expect(slugify("Portaria nº 104/2026")).toBe("portaria-n-104-2026");
    expect(slugify("  A  --  B  ")).toBe("a-b");
  });
});
