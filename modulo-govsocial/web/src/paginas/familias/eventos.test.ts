import { describe, expect, it } from "vitest";
import { estiloEvento, tipoEventoDe } from "@/paginas/familias/eventos";

describe("tipoEventoDe", () => {
  it("classifica por código de serviço", () => {
    expect(tipoEventoDe("PAIF")).toBe("PAIF");
    expect(tipoEventoDe("SCFV_6_15")).toBe("SCFV");
    expect(tipoEventoDe("PAEFI")).toBe("PAEFI");
    expect(tipoEventoDe("MSE_LA")).toBe("MSE");
    expect(tipoEventoDe("QUALQUER")).toBe("OUTRO");
  });

  it("visita domiciliar tem precedência sobre o serviço", () => {
    expect(tipoEventoDe("PAIF", "VISITA_DOMICILIAR")).toBe("VISITA");
  });
});

describe("estiloEvento", () => {
  it("cada tipo tem cor, rótulo e marcador", () => {
    const e = estiloEvento("PAIF");
    expect(e.cor).toBe("paif");
    expect(e.rotulo).toContain("PAIF");
    expect(e.marcador).toContain("bg-");
  });
});
