import { describe, expect, it } from "vitest";
import { corDestaqueAprovada, razaoContraste } from "@/tema/contraste";

describe("razaoContraste", () => {
  it("preto x branco tem razão máxima (~21)", () => {
    expect(razaoContraste("#000000", "#FFFFFF")).toBeCloseTo(21, 0);
  });

  it("mesma cor tem razão 1", () => {
    expect(razaoContraste("#17635A", "#17635A")).toBeCloseTo(1, 5);
  });
});

describe("corDestaqueAprovada (tematização por tenant)", () => {
  it("aprova cor escura contra texto branco (>= 3:1)", () => {
    expect(corDestaqueAprovada("#17635A", "#FFFFFF")).toBe(true);
  });

  it("reprova cor clara contra texto branco (contraste baixo)", () => {
    expect(corDestaqueAprovada("#FDE68A", "#FFFFFF")).toBe(false);
  });

  it("reprova cor ausente ou inválida", () => {
    expect(corDestaqueAprovada(null, "#FFFFFF")).toBe(false);
    expect(corDestaqueAprovada("xyz", "#FFFFFF")).toBe(false);
  });
});
