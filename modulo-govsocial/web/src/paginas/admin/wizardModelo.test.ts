import { describe, expect, it } from "vitest";
import {
  calcularPronto,
  esquemaProfissional,
  esquemaTerritorio,
  esquemaUnidade,
  etapaConcluida,
  proximaEtapaPendente,
  resumoConciliacao,
} from "@/paginas/admin/wizardModelo";
import type { ImportJobOut, TenantOnboardingStatus } from "@/tipos/admin";

function status(concluidas: string[]): TenantOnboardingStatus {
  const todas = ["units", "territories", "benefits", "professionals", "import"];
  return {
    tenant_id: "t1",
    tenant_name: "Nova Esperança",
    steps: todas.map((step) => ({ step, completed: concluidas.includes(step) })),
    ready: todas.every((s) => concluidas.includes(s)),
  };
}

describe("esquemaUnidade", () => {
  it("aceita uma unidade válida", () => {
    const r = esquemaUnidade.safeParse({ tipo: "CRAS", nome: "CRAS Norte", uf: "PB" });
    expect(r.success).toBe(true);
  });

  it("rejeita nome curto", () => {
    const r = esquemaUnidade.safeParse({ tipo: "CRAS", nome: "" });
    expect(r.success).toBe(false);
  });

  it("rejeita UF com tamanho diferente de 2", () => {
    const r = esquemaUnidade.safeParse({ tipo: "CRAS", nome: "CRAS", uf: "PBX" });
    expect(r.success).toBe(false);
  });
});

describe("esquemaTerritorio", () => {
  it("exige ao menos uma unidade", () => {
    expect(esquemaTerritorio.safeParse({ nome: "Vila Rica", unidades: [] }).success).toBe(false);
    expect(
      esquemaTerritorio.safeParse({ nome: "Vila Rica", unidades: ["u1"] }).success,
    ).toBe(true);
  });
});

describe("esquemaProfissional", () => {
  it("aceita profissional sem CPF", () => {
    expect(esquemaProfissional.safeParse({ nome: "Carla" }).success).toBe(true);
  });

  it("valida o CPF quando informado", () => {
    const invalido = esquemaProfissional.safeParse({ nome: "Carla", cpf: "111.111.111-11" });
    expect(invalido.success).toBe(false);
  });

  it("rejeita e-mail inválido", () => {
    expect(
      esquemaProfissional.safeParse({ nome: "Carla", email: "nao-email" }).success,
    ).toBe(false);
  });
});

describe("etapaConcluida", () => {
  it("consulta a conclusão pelo nome do backend", () => {
    const s = status(["units"]);
    expect(etapaConcluida(s, "units")).toBe(true);
    expect(etapaConcluida(s, "territories")).toBe(false);
  });

  it("considera a etapa local (sigilo, backend null) sempre concluível", () => {
    expect(etapaConcluida(status([]), null)).toBe(true);
  });
});

describe("calcularPronto", () => {
  it("é verdadeiro só quando todas as etapas estão concluídas", () => {
    expect(calcularPronto(status([]).steps)).toBe(false);
    expect(
      calcularPronto(status(["units", "territories", "benefits", "professionals", "import"]).steps),
    ).toBe(true);
  });

  it("é falso para lista vazia", () => {
    expect(calcularPronto([])).toBe(false);
  });
});

describe("proximaEtapaPendente", () => {
  it("retorna o índice da primeira etapa visível pendente", () => {
    // units concluída → próxima visível pendente é territories (índice 1).
    expect(proximaEtapaPendente(status(["units"]))).toBe(1);
  });

  it("retorna 0 quando tudo pronto", () => {
    expect(
      proximaEtapaPendente(
        status(["units", "territories", "benefits", "professionals", "import"]),
      ),
    ).toBe(0);
  });
});

describe("resumoConciliacao", () => {
  it("soma os contadores e calcula o total", () => {
    const job: ImportJobOut = {
      id: "j1",
      tipo: "CADUNICO",
      status: "CONCLUIDO",
      nome_arquivo: "base.csv",
      total_linhas: 100,
      linhas_processadas: 100,
      novos: 60,
      atualizados: 25,
      conflitos: 10,
      erros: 5,
      criado_por_id: "u1",
      created_at: "2026-07-10T12:00:00Z",
      updated_at: "2026-07-10T12:00:00Z",
    };
    expect(resumoConciliacao(job)).toEqual({
      novos: 60,
      atualizados: 25,
      conflitos: 10,
      erros: 5,
      total: 100,
    });
  });

  it("trata contadores nulos como zero", () => {
    const job = {
      novos: null,
      atualizados: null,
      conflitos: null,
      erros: null,
    } as unknown as ImportJobOut;
    expect(resumoConciliacao(job)).toEqual({
      novos: 0,
      atualizados: 0,
      conflitos: 0,
      erros: 0,
      total: 0,
    });
  });
});
