import { describe, expect, it } from "vitest";
import {
  derivarCodigo,
  humanizarCampo,
  mapaDeAjustes,
  normalizarBlocos,
  podeEditarRma,
  rotuloBloco,
  rotuloCompetencia,
  statusRmaParaFluxo,
} from "@/paginas/rma/rmaModelo";
import type { RmaAjusteOut } from "@/tipos/rma";

describe("derivarCodigo", () => {
  it("extrai o código curto do início da chave", () => {
    expect(derivarCodigo("C1_total_familias_atendidas")).toBe("C1");
    expect(derivarCodigo("A2_familias_novas_mes")).toBe("A2");
    expect(derivarCodigo("D1_participantes_scfv")).toBe("D1");
  });

  it("devolve a própria chave quando não há prefixo de código", () => {
    expect(derivarCodigo("total")).toBe("total");
  });
});

describe("humanizarCampo", () => {
  it("usa o rótulo conhecido quando existe", () => {
    expect(humanizarCampo("C1_total_familias_atendidas")).toBe("Famílias atendidas");
  });

  it("humaniza chaves desconhecidas em snake_case", () => {
    expect(humanizarCampo("Z9_algo_novo_aqui")).toBe("Algo novo aqui");
  });
});

describe("rotuloBloco", () => {
  it("mapeia blocos conhecidos", () => {
    expect(rotuloBloco("CRAS_C")).toContain("Atendimentos individualizados");
  });

  it("humaniza blocos desconhecidos", () => {
    expect(rotuloBloco("OUTRO_BLOCO")).toBe("Bloco OUTRO BLOCO");
  });
});

describe("normalizarBlocos", () => {
  it("normaliza o shape dicionário-de-dicionários (backend real)", () => {
    const blocos = normalizarBlocos({
      CRAS_C: { C1_total_familias_atendidas: 128, C4_enc_bpc: 6 },
      _metadata: { periodo: "2026-06" },
    });
    expect(blocos).toHaveLength(1);
    expect(blocos[0].id).toBe("CRAS_C");
    expect(blocos[0].campos).toHaveLength(2);
    const c1 = blocos[0].campos.find((c) => c.campo === "C1_total_familias_atendidas");
    expect(c1?.codigo).toBe("C1");
    expect(c1?.valor).toBe(128);
    expect(c1?.rotulo).toBe("Famílias atendidas");
  });

  it("ignora chaves de metadados (começam com _)", () => {
    const blocos = normalizarBlocos({
      CRAS_A: { A1_familias_acompanhamento: 96 },
      _metadata: { unidade_tipo: "CRAS" },
    });
    expect(blocos.map((b) => b.id)).toEqual(["CRAS_A"]);
  });

  it("normaliza o shape de lista (fixture legada)", () => {
    const blocos = normalizarBlocos({
      bloco2: [
        { campo: "C1", rotulo: "Famílias atendidas", valor: 128 },
        { campo: "C4", rotulo: "Encaminhados ao BPC", valor: 5 },
      ],
    });
    expect(blocos).toHaveLength(1);
    expect(blocos[0].campos[0]).toMatchObject({
      campo: "C1",
      codigo: "C1",
      rotulo: "Famílias atendidas",
      valor: 128,
    });
  });

  it("devolve lista vazia para dados nulos", () => {
    expect(normalizarBlocos(null)).toEqual([]);
    expect(normalizarBlocos(undefined)).toEqual([]);
  });
});

describe("mapaDeAjustes", () => {
  const ajuste = (campo: string, created_at: string, valor: number): RmaAjusteOut => ({
    id: `aj-${campo}-${created_at}`,
    bloco: "CRAS_C",
    campo,
    valor_calculado: 6,
    valor_ajustado: valor,
    justificativa: "x",
    ajustado_por_id: "u1",
    created_at,
  });

  it("indexa por bloco::campo", () => {
    const mapa = mapaDeAjustes([ajuste("C4_enc_bpc", "2026-07-02T09:00:00Z", 5)]);
    expect(mapa.get("CRAS_C::C4_enc_bpc")?.valor_ajustado).toBe(5);
  });

  it("mantém o ajuste mais recente por campo", () => {
    const mapa = mapaDeAjustes([
      ajuste("C4_enc_bpc", "2026-07-02T09:00:00Z", 5),
      ajuste("C4_enc_bpc", "2026-07-03T10:00:00Z", 4),
    ]);
    expect(mapa.get("CRAS_C::C4_enc_bpc")?.valor_ajustado).toBe(4);
  });
});

describe("statusRmaParaFluxo", () => {
  it("posiciona a etapa conforme o status", () => {
    expect(statusRmaParaFluxo("EM_CONFERENCIA")).toEqual({ indice: 1, fechado: false });
    expect(statusRmaParaFluxo("ABERTO")).toEqual({ indice: 1, fechado: false });
    expect(statusRmaParaFluxo("REABERTO")).toEqual({ indice: 1, fechado: false });
    expect(statusRmaParaFluxo("FECHADO")).toEqual({ indice: 2, fechado: true });
  });
});

describe("podeEditarRma", () => {
  it("bloqueia edição apenas quando fechado", () => {
    expect(podeEditarRma("EM_CONFERENCIA")).toBe(true);
    expect(podeEditarRma("REABERTO")).toBe(true);
    expect(podeEditarRma("FECHADO")).toBe(false);
  });
});

describe("rotuloCompetencia", () => {
  it("formata mês/ano em pt-BR com inicial maiúscula", () => {
    expect(rotuloCompetencia(2026, 6)).toBe("Junho/2026");
    expect(rotuloCompetencia(2026, 3)).toBe("Março/2026");
  });
});
