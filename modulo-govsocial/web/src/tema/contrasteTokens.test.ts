import { describe, expect, it } from "vitest";
import { razaoContraste } from "@/tema/contraste";

/**
 * FIX 7 (metadados "cinza-claros" — CPF/NIS mascarados, datas, hints): valida
 * que o token de texto secundário (--ga-ink-soft) atinge AA (>= 4.5:1) sobre
 * as superfícies reais onde é usado (cards/glass-card), nos dois temas.
 * Valores extraídos de src/estilos/tokens.css.
 */
const MINIMO_AA_TEXTO = 4.5;

describe("contraste de tokens — texto secundário (ink-soft)", () => {
  it("tema claro: ink-soft sobre surface passa AA", () => {
    expect(razaoContraste("#59576E", "#f9f9fc")).toBeGreaterThanOrEqual(MINIMO_AA_TEXTO);
  });

  it("tema claro: ink-soft sobre surface-container-lowest (fundo do glass-card) passa AA", () => {
    expect(razaoContraste("#59576E", "#ffffff")).toBeGreaterThanOrEqual(MINIMO_AA_TEXTO);
  });

  it("tema escuro: ink-soft sobre surface passa AA", () => {
    expect(razaoContraste("#b8b5cc", "#1b1b1f")).toBeGreaterThanOrEqual(MINIMO_AA_TEXTO);
  });

  it("tema escuro: ink-soft sobre surface-container-lowest (fundo do glass-card) passa AA", () => {
    expect(razaoContraste("#b8b5cc", "#18181c")).toBeGreaterThanOrEqual(MINIMO_AA_TEXTO);
  });
});
