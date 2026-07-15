import { describe, expect, it } from "vitest";
import { esquemaFamilia } from "@/paginas/familias/esquemaFamilia";

describe("esquemaFamilia (Zod, espelha o backend)", () => {
  const base = {
    responsavel: { nome_civil: "Maria Souza" },
    no_cadunico: false,
    beneficiaria_pbf: false,
    possui_bpc: false,
    inseguranca_alimentar: false,
  };

  it("aceita família mínima válida (só responsável)", () => {
    const r = esquemaFamilia.safeParse(base);
    expect(r.success).toBe(true);
  });

  it("exige nome civil do responsável", () => {
    const r = esquemaFamilia.safeParse({ ...base, responsavel: { nome_civil: "" } });
    expect(r.success).toBe(false);
  });

  it("rejeita CPF do responsável com DV inválido", () => {
    const r = esquemaFamilia.safeParse({
      ...base,
      responsavel: { nome_civil: "Maria", cpf: "52998224724" },
    });
    expect(r.success).toBe(false);
  });

  it("rejeita CEP com menos de 8 dígitos", () => {
    const r = esquemaFamilia.safeParse({ ...base, cep: "5800" });
    expect(r.success).toBe(false);
  });

  it("aceita CEP vazio (opcional)", () => {
    const r = esquemaFamilia.safeParse({ ...base, cep: "" });
    expect(r.success).toBe(true);
  });
});
