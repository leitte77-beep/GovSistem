import { describe, expect, it } from "vitest";
import type { MemberOut, PersonOut, FamilyOut } from "@/tipos/pessoas";
import type { ConcessaoOut } from "@/tipos/beneficios";
import {
  derivarMembro,
  resumoDe,
  filtrar,
  ordenar,
  alertasDe,
  faixaDe,
  cadastroDesatualizado,
  normalizar,
  type MembroDerivado,
} from "@/paginas/familias/composicao/derivacao";

const HOJE = new Date("2026-07-24T12:00:00Z");
const familia: Pick<FamilyOut, "beneficiaria_pbf" | "possui_bpc"> = {
  beneficiaria_pbf: true,
  possui_bpc: false,
};

// Spread sobre o base: um `null` explícito no override sobrescreve o default
// (com `??` um `null` cairia de volta no default — bug clássico de fixture).
function membro(over: Partial<MemberOut> = {}): MemberOut {
  return {
    membership_id: `m-${over.person_id ?? "x"}`,
    person_id: "p1",
    nome_exibicao: "Fulano",
    parentesco: "FILHO",
    status: "ATIVO",
    data_entrada: "2026-01-10",
    data_saida: null,
    is_responsavel: false,
    ...over,
  };
}

function pessoa(over: Partial<PersonOut> = {}): PersonOut {
  return {
    id: "p1",
    nome_civil: "Fulano de Tal",
    nome_social: null,
    nome_exibicao: "Fulano de Tal",
    cpf_mascarado: "***.***.***-80",
    nis_mascarado: "*********880",
    data_nascimento: "1990-05-01",
    sexo: "MASCULINO",
    escolaridade: null,
    ocupacao: null,
    tipo_deficiencia: "NENHUMA",
    deficiencia_detalhe: null,
    raca_cor: null,
    estado_civil: null,
    frequenta_escola: null,
    situacao_mercado_trabalho: null,
    gestante: false,
    amamentando: null,
    renda_mensal: null,
    documentos: null,
    is_falecido: false,
    created_at: "2026-01-10T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    ...over,
  };
}

function derivar(m: MemberOut, p: PersonOut | null, concessoes: ConcessaoOut[] = []) {
  return derivarMembro(m, p, false, concessoes, familia, HOJE);
}

describe("faixaDe", () => {
  it("classifica as faixas etárias do SUAS", () => {
    expect(faixaDe(8)).toBe("crianca");
    expect(faixaDe(15)).toBe("adolescente");
    expect(faixaDe(40)).toBe("adulto");
    expect(faixaDe(70)).toBe("idoso");
    expect(faixaDe(null)).toBe("nao_informada");
  });
});

describe("normalizar", () => {
  it("ignora acentos e caixa", () => {
    expect(normalizar("ASSISTÊNCIA")).toBe("assistencia");
    expect(normalizar("José")).toBe("jose");
  });
});

describe("cadastroDesatualizado", () => {
  it("marca cadastros com mais de 12 meses", () => {
    expect(cadastroDesatualizado("2024-01-01", 12, HOJE)).toBe(true);
    expect(cadastroDesatualizado("2026-07-01", 12, HOJE)).toBe(false);
    expect(cadastroDesatualizado(null, 12, HOJE)).toBe(false);
  });
});

describe("derivarMembro — badges", () => {
  it("PcD é institucional (não vira pendência)", () => {
    const d = derivar(membro({ person_id: "p1" }), pessoa({ tipo_deficiencia: "FISICA" }));
    expect(d.temDeficiencia).toBe(true);
    expect(d.deficiencia?.categoria).toBe("deficiencia");
    expect(d.pendencias.find((b) => b.texto.includes("deficiência"))).toBeUndefined();
  });

  it("Bolsa Família aparece no responsável quando a família é beneficiária", () => {
    const d = derivar(membro({ is_responsavel: true }), pessoa());
    expect(d.beneficios.some((b) => b.texto === "Bolsa Família")).toBe(true);
    expect(d.temBeneficio).toBe(true);
  });

  it("CPF ausente/irregular vira pendência crítica", () => {
    const d = derivar(membro(), pessoa({ cpf_mascarado: null }));
    expect(d.temPendencia).toBe(true);
    expect(d.pendencias.some((b) => b.texto === "CPF a regularizar")).toBe(true);
  });

  it("gestante vira acompanhamento", () => {
    const d = derivar(membro(), pessoa({ gestante: true }));
    expect(d.temAcompanhamento).toBe(true);
  });

  it("concessão ativa da pessoa vira badge de benefício", () => {
    const c = {
      id: "c1", family_id: "f1", person_id: "p1", unit_id: "u1",
      benefit_type_code: "CESTA_BASICA", quantidade: 1, valor_total: null,
      status: "ENTREGUE", data_solicitacao: "2026-06-01", data_analise: null,
      data_aprovacao: null, data_entrega: null, solicitado_por_id: null,
      analisado_por_id: null, aprovado_por_id: null, parecer: null,
      parecer_restrito: false, motivo_negacao: null, comprovante_gerado: false,
      assinatura_data: null, created_at: "", updated_at: "",
    } satisfies ConcessaoOut;
    const d = derivar(membro({ person_id: "p1" }), pessoa(), [c]);
    expect(d.beneficios.some((b) => b.texto.includes("CESTA_BASICA"))).toBe(true);
  });

  it("sem pessoa carregada, não afirma pendência", () => {
    const d = derivarMembro(membro(), null, true, [], familia, HOJE);
    expect(d.temPendencia).toBe(false);
    expect(d.carregandoPessoa).toBe(true);
  });
});

describe("resumoDe", () => {
  it("conta faixas, PcD, benefícios e pendências", () => {
    const ds: MembroDerivado[] = [
      derivar(membro({ person_id: "a", is_responsavel: true }), pessoa({ id: "a", data_nascimento: "1985-01-01" })),
      derivar(membro({ person_id: "b" }), pessoa({ id: "b", data_nascimento: "2016-01-01", cpf_mascarado: null, tipo_deficiencia: "VISUAL" })),
      derivar(membro({ person_id: "c" }), pessoa({ id: "c", data_nascimento: "2009-01-01" })),
    ];
    const r = resumoDe(ds);
    expect(r.totalAtivos).toBe(3);
    expect(r.adultos).toBe(1);
    expect(r.criancas).toBe(1);
    expect(r.adolescentes).toBe(1);
    expect(r.pcd).toBe(1);
    expect(r.beneficiarios).toBe(1); // só o responsável (PBF)
    expect(r.pendencias).toBe(1); // a criança sem CPF
  });
});

describe("filtrar", () => {
  const ds = [
    derivar(membro({ person_id: "a", nome_exibicao: "Maria Souza", is_responsavel: true }), pessoa({ id: "a", data_nascimento: "1980-01-01" })),
    derivar(membro({ person_id: "b", nome_exibicao: "João Lima" }), pessoa({ id: "b", data_nascimento: "2015-01-01", cpf_mascarado: null })),
  ];

  it("busca por nome ignorando acento/caixa", () => {
    expect(filtrar(ds, ["todos"], "joao").length).toBe(1);
    expect(filtrar(ds, [], "MARIA").length).toBe(1);
  });

  it("filtra por pendências", () => {
    const res = filtrar(ds, ["pendencias"], "");
    expect(res.length).toBe(1);
    expect(res[0].membro.nome_exibicao).toBe("João Lima");
  });

  it("combina filtro e busca", () => {
    expect(filtrar(ds, ["responsavel"], "joao").length).toBe(0);
  });
});

describe("ordenar", () => {
  const ds = [
    derivar(membro({ person_id: "a", nome_exibicao: "Bruno", data_entrada: "2026-01-01" }), pessoa({ id: "a", data_nascimento: "2010-01-01" })),
    derivar(membro({ person_id: "b", nome_exibicao: "Ana", is_responsavel: true, data_entrada: "2026-03-01" }), pessoa({ id: "b", data_nascimento: "1975-01-01" })),
  ];

  it("padrão coloca o responsável primeiro", () => {
    expect(ordenar(ds, "padrao")[0].membro.is_responsavel).toBe(true);
  });

  it("nome_az ordena alfabeticamente", () => {
    expect(ordenar(ds, "nome_az").map((d) => d.membro.nome_exibicao)).toEqual(["Ana", "Bruno"]);
  });

  it("inclusao_recente ordena por data de entrada desc", () => {
    expect(ordenar(ds, "inclusao_recente")[0].membro.nome_exibicao).toBe("Ana");
  });
});

describe("alertasDe", () => {
  it("acusa dois responsáveis ativos", () => {
    const ds = [
      derivar(membro({ person_id: "a", is_responsavel: true }), pessoa({ id: "a" })),
      derivar(membro({ person_id: "b", is_responsavel: true }), pessoa({ id: "b" })),
    ];
    expect(alertasDe(ds, HOJE).some((a) => a.id === "multiplos-responsaveis")).toBe(true);
  });

  it("acusa família sem responsável", () => {
    const ds = [derivar(membro({ person_id: "a" }), pessoa({ id: "a" }))];
    expect(alertasDe(ds, HOJE).some((a) => a.id === "sem-responsavel")).toBe(true);
  });

  it("acusa pessoa falecida ativa", () => {
    const ds = [derivar(membro({ person_id: "a", is_responsavel: true }), pessoa({ id: "a", is_falecido: true }))];
    expect(alertasDe(ds, HOJE).some((a) => a.id.startsWith("falecido"))).toBe(true);
  });

  it("acusa menor sem adulto na composição", () => {
    const ds = [derivar(membro({ person_id: "a", is_responsavel: true }), pessoa({ id: "a", data_nascimento: "2016-01-01" }))];
    expect(alertasDe(ds, HOJE).some((a) => a.id === "menor-sem-adulto")).toBe(true);
  });
});
