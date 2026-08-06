import { FAMILIA } from "./novaEsperanca";

/**
 * Fixtures e store dinâmico de benefícios (Fase 5). Inclui uma concessão de
 * "Cesta básica" ENTREGUE há 12 dias, com janela de 30 dias → dispara o alerta
 * de duplicidade na tela de concessão.
 */
export const BENEFIT_TYPES = [
  {
    id: "bt-cesta",
    code: "CESTA_BASICA",
    nome: "Cesta básica",
    categoria: "ALIMENTACAO",
    unidade_medida: "UNIDADE",
    exige_parecer: true,
    periodicidade_max_dias: 30,
    ativo: true,
  },
  {
    id: "bt-auxilio-natalidade",
    code: "AUXILIO_NATALIDADE",
    nome: "Auxílio natalidade",
    categoria: "NATALIDADE",
    unidade_medida: "UNIDADE",
    exige_parecer: true,
    periodicidade_max_dias: null,
    ativo: true,
  },
  {
    id: "bt-auxilio-funeral",
    code: "AUXILIO_FUNERAL",
    nome: "Auxílio funeral",
    categoria: "FUNERAL",
    unidade_medida: "UNIDADE",
    exige_parecer: true,
    periodicidade_max_dias: null,
    ativo: true,
  },
];

type ConcessaoMock = {
  id: string;
  family_id: string;
  person_id: string | null;
  unit_id: string;
  benefit_type_code: string;
  quantidade: number;
  valor_total: number | null;
  status: string;
  data_solicitacao: string;
  data_analise: string | null;
  data_aprovacao: string | null;
  data_entrega: string | null;
  solicitado_por_id: string | null;
  analisado_por_id: string | null;
  aprovado_por_id: string | null;
  parecer: string | null;
  parecer_restrito: boolean;
  motivo_negacao: string | null;
  comprovante_gerado: boolean;
  assinatura_data: string | null;
  created_at: string;
  updated_at: string;
};

function diasAtras(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

let concessoes: ConcessaoMock[] = [];

export function resetarBeneficios() {
  concessoes = [
    {
      id: "conc-cesta-antiga",
      family_id: FAMILIA.id,
      person_id: null,
      unit_id: "u-cras-sul",
      benefit_type_code: "CESTA_BASICA",
      quantidade: 1,
      valor_total: null,
      status: "ENTREGUE",
      data_solicitacao: diasAtras(12),
      data_analise: diasAtras(12),
      data_aprovacao: diasAtras(12),
      data_entrega: diasAtras(12),
      solicitado_por_id: null,
      analisado_por_id: null,
      aprovado_por_id: null,
      parecer: null,
      parecer_restrito: true,
      motivo_negacao: null,
      comprovante_gerado: true,
      assinatura_data: diasAtras(12),
      created_at: diasAtras(12),
      updated_at: diasAtras(12),
    },
  ];
}
resetarBeneficios();

export function listarConcessoes(familyId?: string): ConcessaoMock[] {
  return concessoes
    .filter((c) => !familyId || c.family_id === familyId)
    .sort((a, b) => (a.data_solicitacao < b.data_solicitacao ? 1 : -1));
}

export function obterConcessao(id: string): ConcessaoMock | undefined {
  return concessoes.find((c) => c.id === id);
}

export function criarConcessao(body: {
  family_id: string;
  person_id?: string | null;
  unit_id: string;
  benefit_type_code: string;
  quantidade?: number;
  valor_total?: number | null;
}): ConcessaoMock {
  const agora = new Date().toISOString();
  const c: ConcessaoMock = {
    id: `conc-${crypto.randomUUID()}`,
    family_id: body.family_id,
    person_id: body.person_id ?? null,
    unit_id: body.unit_id,
    benefit_type_code: body.benefit_type_code,
    quantidade: body.quantidade ?? 1,
    valor_total: body.valor_total ?? null,
    status: "SOLICITADO",
    data_solicitacao: agora,
    data_analise: null,
    data_aprovacao: null,
    data_entrega: null,
    solicitado_por_id: null,
    analisado_por_id: null,
    aprovado_por_id: null,
    parecer: null,
    parecer_restrito: true,
    motivo_negacao: null,
    comprovante_gerado: false,
    assinatura_data: null,
    created_at: agora,
    updated_at: agora,
  };
  concessoes.push(c);
  return c;
}

/** Verifica antiduplicidade como o backend (APROVADO/ENTREGUE na janela). */
export function temDuplicidade(familyId: string, benefitCode: string): boolean {
  const bt = BENEFIT_TYPES.find((b) => b.code === benefitCode);
  if (!bt?.periodicidade_max_dias) return false;
  const limite = new Date();
  limite.setDate(limite.getDate() - bt.periodicidade_max_dias);
  return concessoes.some(
    (c) =>
      c.family_id === familyId &&
      c.benefit_type_code === benefitCode &&
      ["APROVADO", "ENTREGUE"].includes(c.status) &&
      new Date(c.data_solicitacao) >= limite,
  );
}

export function transicionar(
  id: string,
  acao: "analyze" | "approve" | "deny" | "deliver",
  extra?: { parecer?: string | null; motivo?: string },
): ConcessaoMock | null {
  const c = obterConcessao(id);
  if (!c) return null;
  const agora = new Date().toISOString();
  if (acao === "analyze") {
    c.status = "EM_ANALISE";
    c.data_analise = agora;
    c.parecer = extra?.parecer ?? null;
  } else if (acao === "approve") {
    c.status = "APROVADO";
    c.data_aprovacao = agora;
  } else if (acao === "deny") {
    c.status = "NEGADO";
    c.motivo_negacao = extra?.motivo ?? "Não atende aos critérios";
  } else if (acao === "deliver") {
    c.status = "ENTREGUE";
    c.data_entrega = agora;
    c.comprovante_gerado = true;
    c.assinatura_data = agora;
  }
  c.updated_at = agora;
  return c;
}
