import { describe, expect, it } from "vitest";
import { esquemaPessoa } from "@/paginas/familias/esquemaPessoa";

describe("esquemaPessoa (Zod, espelha PersonCreate/PersonUpdate)", () => {
  const base = { nome_civil: "Joana Souza" };

  it("aceita pessoa mínima (só nome civil)", () => {
    expect(esquemaPessoa.safeParse(base).success).toBe(true);
  });

  it("exige nome civil", () => {
    expect(esquemaPessoa.safeParse({ nome_civil: "" }).success).toBe(false);
  });

  it("rejeita CPF com DV inválido", () => {
    const r = esquemaPessoa.safeParse({ ...base, cpf: "52998224724" });
    expect(r.success).toBe(false);
  });

  it("aceita CPF com DV válido", () => {
    const r = esquemaPessoa.safeParse({ ...base, cpf: "52998224725" });
    expect(r.success).toBe(true);
  });

  it("preserva os campos do CadÚnico que o backend descartava", () => {
    const r = esquemaPessoa.safeParse({
      ...base,
      raca_cor: "PARDA",
      estado_civil: "UNIAO_ESTAVEL",
      frequenta_escola: false,
      situacao_mercado_trabalho: "AUTONOMO",
      gestante: true,
      amamentando: false,
      renda_mensal: 1320.5,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.raca_cor).toBe("PARDA");
      expect(r.data.situacao_mercado_trabalho).toBe("AUTONOMO");
      expect(r.data.renda_mensal).toBe(1320.5);
    }
  });

  // register(valueAsNumber) devolve NaN quando o campo numérico está vazio;
  // sem o preprocess, z.number() barra o submit com um erro incompreensível.
  it("trata renda vazia (NaN) como não informada", () => {
    const r = esquemaPessoa.safeParse({ ...base, renda_mensal: NaN });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.renda_mensal).toBeUndefined();
  });

  it("rejeita renda negativa", () => {
    expect(esquemaPessoa.safeParse({ ...base, renda_mensal: -1 }).success).toBe(false);
  });
});
