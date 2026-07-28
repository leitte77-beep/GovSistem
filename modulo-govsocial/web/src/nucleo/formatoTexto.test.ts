import { describe, it, expect } from "vitest";
import { normalizarNomeUnidade } from "./formatoTexto";

describe("normalizarNomeUnidade", () => {
  it("corrige acento faltante preservando capitalização em CAIXA ALTA", () => {
    expect(normalizarNomeUnidade("ASSISTENCIA SOCIAL")).toBe("ASSISTÊNCIA SOCIAL");
  });

  it("não altera nomes que já têm o acento correto", () => {
    expect(normalizarNomeUnidade("Secretaria de Assistência Social")).toBe(
      "Secretaria de Assistência Social",
    );
  });

  it("não mexe em siglas de unidade (CRAS, CREAS, SEDE)", () => {
    expect(normalizarNomeUnidade("CRAS Norte")).toBe("CRAS Norte");
    expect(normalizarNomeUnidade("CREAS Municipal")).toBe("CREAS Municipal");
    expect(normalizarNomeUnidade("Secretaria (SEDE)")).toBe("Secretaria (SEDE)");
  });

  it("colapsa espaços duplicados", () => {
    expect(normalizarNomeUnidade("CREAS  Municipal")).toBe("CREAS Municipal");
  });
});
