import {
  actTypeConfig,
  identificationWarnings,
  parseTitleMetadata,
  suggestTitle,
} from "../actTitle";

describe("suggestTitle", () => {
  it("builds TYPE Nº 000/YEAR from structured data", () => {
    expect(suggestTitle("Portaria", "04", 2026)).toBe("PORTARIA Nº 04/2026");
  });

  it("pads single-digit numbers", () => {
    expect(suggestTitle("Decreto", "5", 2026)).toBe("DECRETO Nº 05/2026");
  });

  it("omits Nº when neither number nor year is set", () => {
    expect(suggestTitle("Lei", null, null)).toBe("LEI");
  });

  it("uses per-type custom title_pattern from config", () => {
    expect(
      suggestTitle("Contrato", "007", 2026, {
        title_pattern: "CONTRATO ADMINISTRATIVO Nº {number}/{year}",
      })
    ).toBe("CONTRATO ADMINISTRATIVO Nº 007/2026");
  });

  it("returns empty string without act type", () => {
    expect(suggestTitle("", "04", 2026)).toBe("");
  });
});

describe("identificationWarnings", () => {
  it("flags type/title mismatch as advisory warning", () => {
    const w = identificationWarnings({
      actTypeName: "Portaria",
      actNumber: null,
      actYear: null,
      title: "DECRETO Nº 04/2026",
    });
    expect(w.some((x) => x.includes("inconsistência"))).toBe(true);
  });

  it("does not warn when title matches selected type", () => {
    const w = identificationWarnings({
      actTypeName: "Portaria",
      actNumber: null,
      actYear: null,
      title: "PORTARIA Nº 04/2026",
    });
    expect(w).toHaveLength(0);
  });

  it("flags number divergence between structured field and title", () => {
    const w = identificationWarnings({
      actTypeName: "Portaria",
      actNumber: "04",
      actYear: 2026,
      title: "PORTARIA Nº 05/2026",
    });
    expect(w.some((x) => x.includes("diverge do número"))).toBe(true);
  });

  it("flags year divergence", () => {
    const w = identificationWarnings({
      actTypeName: "Portaria",
      actNumber: "04",
      actYear: 2025,
      title: "PORTARIA Nº 04/2026",
    });
    expect(w.some((x) => x.includes("diverge do ano"))).toBe(true);
  });

  it("stays silent for types without known keywords (Outros)", () => {
    const w = identificationWarnings({
      actTypeName: "Outros",
      actNumber: null,
      actYear: null,
      title: "QUALQUER TÍTULO",
    });
    expect(w).toHaveLength(0);
  });
});

describe("parseTitleMetadata", () => {
  it("extracts number and year from legacy title", () => {
    expect(parseTitleMetadata("PORTARIA – 04/2026")).toEqual({ number: "4", year: 2026 });
  });

  it("returns nulls when title has no number/year", () => {
    expect(parseTitleMetadata("EDITAL DE CONVOCAÇÃO")).toEqual({ number: null, year: null });
  });
});

describe("actTypeConfig", () => {
  it("applies defaults when config absent", () => {
    const cfg = actTypeConfig(null);
    expect(cfg.number_required).toBe(true);
    expect(cfg.year_required).toBe(true);
  });

  it("respects per-type overrides", () => {
    const cfg = actTypeConfig({ number_required: false });
    expect(cfg.number_required).toBe(false);
    expect(cfg.year_required).toBe(true);
  });
});
