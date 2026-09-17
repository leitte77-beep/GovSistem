import { describe, expect, it } from "vitest";

import { PERM, abasDoProcesso, homeDoPerfil, navGroupsDoPerfil, perfilDoUsuario } from "./perfil";

describe("perfil do usuário", () => {
  it("classifica pelas permissões, não pelo nome da role", () => {
    expect(perfilDoUsuario([PERM.TASK_ASSIGN])).toBe("coordenacao");
    expect(perfilDoUsuario([PERM.ENGINEERING])).toBe("engenharia");
    expect(perfilDoUsuario([PERM.LICITACAO])).toBe("licitacao");
    expect(perfilDoUsuario([PERM.FINANCIAL_VIEW])).toBe("executivo");
    expect(perfilDoUsuario([])).toBe("colaborador");
  });

  it("cada perfil abre na sua tela de trabalho", () => {
    expect(homeDoPerfil("coordenacao")).toBe("/assessor");
    expect(homeDoPerfil("executivo")).toBe("/prefeito");
    expect(homeDoPerfil("colaborador")).toBe("/departamento");
  });
});

describe("navegação", () => {
  it("todo perfil enxerga acompanhamentos e menções", () => {
    const chaves = navGroupsDoPerfil("colaborador", []).flatMap((g) => g.items.map((i) => i.key));
    expect(chaves).toContain("acompanhamentos");
    expect(chaves).toContain("mencoes");
  });

  it("prestações entram por permissão fora da coordenação", () => {
    const semPermissao = navGroupsDoPerfil("colaborador", []).flatMap((g) => g.items.map((i) => i.key));
    expect(semPermissao).not.toContain("prestacoes");

    const comPermissao = navGroupsDoPerfil("colaborador", [PERM.ACCOUNTABILITY]).flatMap((g) =>
      g.items.map((i) => i.key)
    );
    expect(comPermissao).toContain("prestacoes");
  });
});

describe("abas do processo", () => {
  it("obras e medições entram para a engenharia", () => {
    const abas = abasDoProcesso([PERM.ENGINEERING]).map((a) => a.key);
    expect(abas).toContain("obras");
    expect(abas).toContain("medicoes");
  });

  it("financeiro só com permissão financeira", () => {
    expect(abasDoProcesso([]).map((a) => a.key)).not.toContain("financeiro");
    expect(abasDoProcesso([PERM.FINANCIAL_VIEW]).map((a) => a.key)).toContain("financeiro");
  });
});
