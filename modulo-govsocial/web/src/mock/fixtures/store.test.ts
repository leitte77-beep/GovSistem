import { describe, expect, it, beforeEach } from "vitest";
import {
  criarPessoa,
  cpfOuNisEmUso,
  encontrarDuplicatas,
  resetarStore,
} from "@/mock/fixtures/store";

describe("dedup do store mock (espelha o backend)", () => {
  beforeEach(() => resetarStore());

  it("detecta possível duplicata por nome + nascimento", () => {
    const cands = encontrarDuplicatas("Maria da Silva Souza", "1988-05-14");
    expect(cands.length).toBe(1);
    expect(cands[0].cpf_mascarado).toBe("***.***.***-25");
  });

  it("não detecta duplicata quando o nascimento difere", () => {
    const cands = encontrarDuplicatas("Maria da Silva Souza", "1990-01-01");
    expect(cands.length).toBe(0);
  });

  it("bloqueia CPF já em uso", () => {
    expect(cpfOuNisEmUso("52998224725", null)).toBe("cpf");
  });

  it("cria pessoa nova e usa nome social como exibição", () => {
    const p = criarPessoa({
      nome_civil: "José Antônio",
      nome_social: "Bruna",
      cpf: null,
      nis: null,
      data_nascimento: "2000-03-03",
      sexo: "FEMININO",
    });
    expect(p.nome_exibicao).toBe("Bruna");
    expect(p.id).toBeTruthy();
  });
});
