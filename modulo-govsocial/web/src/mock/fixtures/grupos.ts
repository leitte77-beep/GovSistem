import { FAMILIA, RESULTADOS_BUSCA } from "./novaEsperanca";

/**
 * Fixtures e store dinâmico de grupos/SCFV e frequência (Fase 6).
 * Fiel aos schemas do backend (app/schemas/acoes_coletivas.py). Reutiliza as
 * pessoas do store (Maria e João) como participantes inscritos, para que a
 * chamada resolva nomes via GET /persons/{id} (o backend não devolve nome na
 * inscrição — sigilo/normalização).
 *
 * Cenário: o grupo "Convivência de Idosos" tem um encontro ANTERIOR com
 * frequência já registrada (para exercitar "repetir último encontro") e um
 * encontro ATUAL sem frequência (a chamada do dia).
 */

const MARIA = RESULTADOS_BUSCA[0].person_id; // b1d2…001
const JOAO = "c3e4f5a6-0000-0000-0000-000000000002";

type AcaoMock = {
  id: string;
  unit_id: string;
  nome: string;
  descricao: string | null;
  tipo: string;
  service_type_code: string | null;
  faixa_etaria: string | null;
  publico_alvo: string | null;
  data_inicio: string;
  data_fim: string | null;
  periodicidade: string | null;
  dia_semana: string | null;
  horario_inicio: string | null;
  horario_fim: string | null;
  local: string | null;
  vagas_total: number | null;
  vagas_disponiveis: number | null;
  status: string;
  profissional_responsavel_id: string | null;
  total_inscritos: number;
  created_at: string;
  updated_at: string;
};

type InscricaoMock = {
  id: string;
  acao_coletiva_id: string;
  person_id: string;
  family_id: string | null;
  data_inscricao: string;
  status: string;
  motivo_desligamento: string | null;
  created_at: string;
};

type EncontroMock = {
  id: string;
  acao_coletiva_id: string;
  data_encontro: string;
  tema: string | null;
  observacoes: string | null;
  total_presentes: number;
  total_faltas: number;
  created_at: string;
};

type FrequenciaMock = {
  id: string;
  encontro_id: string;
  inscricao_id: string;
  presente: boolean;
  justificativa: string | null;
  created_at: string;
};

export const ACAO_SCFV_IDOSOS = "ac01-scfv-idosos-000000000001";
export const ACAO_SCFV_JOVENS = "ac02-scfv-jovens-000000000002";
const ENC_ANTERIOR = "enc-anterior-0000000000000001";
const ENC_ATUAL = "enc-atual-00000000000000000002";
const INSC_MARIA = "insc-maria-000000000000000001";
const INSC_JOAO = "insc-joao-0000000000000000002";

function diasAtras(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function dataDiasAtras(n: number): string {
  return diasAtras(n).slice(0, 10);
}

let acoes: AcaoMock[] = [];
let inscricoes: InscricaoMock[] = [];
let encontros: EncontroMock[] = [];
let frequencias: FrequenciaMock[] = [];

export function resetarGrupos() {
  acoes = [
    {
      id: ACAO_SCFV_IDOSOS,
      unit_id: "u-cras-norte",
      nome: "Convivência de Idosos",
      descricao: "Grupo de convivência e fortalecimento de vínculos para pessoas idosas.",
      tipo: "GRUPO_SCFV",
      service_type_code: "SCFV",
      faixa_etaria: "IDOSO",
      publico_alvo: "Pessoas idosas em situação de vulnerabilidade",
      data_inicio: "2026-02-01",
      data_fim: null,
      periodicidade: "SEMANAL",
      dia_semana: "QUARTA",
      horario_inicio: "14:00",
      horario_fim: "16:00",
      local: "Sala de convivência — CRAS Norte",
      vagas_total: 25,
      vagas_disponiveis: 23,
      status: "ATIVA",
      profissional_responsavel_id: "prof-carla",
      total_inscritos: 2,
      created_at: "2026-02-01T12:00:00Z",
      updated_at: diasAtras(7),
    },
    {
      id: ACAO_SCFV_JOVENS,
      unit_id: "u-cras-norte",
      nome: "SCFV Crianças e Adolescentes",
      descricao: "Serviço de convivência para crianças e adolescentes de 6 a 15 anos.",
      tipo: "GRUPO_SCFV",
      service_type_code: "SCFV",
      faixa_etaria: "CRIANCA_ADOLESCENTE",
      publico_alvo: "Crianças e adolescentes de 6 a 15 anos",
      data_inicio: "2026-03-01",
      data_fim: null,
      periodicidade: "SEMANAL",
      dia_semana: "SEXTA",
      horario_inicio: "09:00",
      horario_fim: "11:00",
      local: "Quadra coberta — CRAS Norte",
      vagas_total: 30,
      vagas_disponiveis: 30,
      status: "ATIVA",
      profissional_responsavel_id: "prof-carla",
      total_inscritos: 0,
      created_at: "2026-03-01T12:00:00Z",
      updated_at: "2026-03-01T12:00:00Z",
    },
  ];

  inscricoes = [
    {
      id: INSC_MARIA,
      acao_coletiva_id: ACAO_SCFV_IDOSOS,
      person_id: MARIA,
      family_id: FAMILIA.id,
      data_inscricao: "2026-02-05T14:00:00Z",
      status: "ATIVA",
      motivo_desligamento: null,
      created_at: "2026-02-05T14:00:00Z",
    },
    {
      id: INSC_JOAO,
      acao_coletiva_id: ACAO_SCFV_IDOSOS,
      person_id: JOAO,
      family_id: FAMILIA.id,
      data_inscricao: "2026-02-05T14:05:00Z",
      status: "ATIVA",
      motivo_desligamento: null,
      created_at: "2026-02-05T14:05:00Z",
    },
  ];

  encontros = [
    {
      id: ENC_ANTERIOR,
      acao_coletiva_id: ACAO_SCFV_IDOSOS,
      data_encontro: dataDiasAtras(7),
      tema: "Roda de conversa sobre memórias",
      observacoes: null,
      total_presentes: 1,
      total_faltas: 1,
      created_at: diasAtras(7),
    },
    {
      id: ENC_ATUAL,
      acao_coletiva_id: ACAO_SCFV_IDOSOS,
      data_encontro: dataDiasAtras(0),
      tema: "Oficina de artesanato",
      observacoes: null,
      total_presentes: 0,
      total_faltas: 0,
      created_at: diasAtras(0),
    },
  ];

  // Encontro anterior: Maria presente, João falta justificada.
  frequencias = [
    {
      id: "freq-ant-maria",
      encontro_id: ENC_ANTERIOR,
      inscricao_id: INSC_MARIA,
      presente: true,
      justificativa: null,
      created_at: diasAtras(7),
    },
    {
      id: "freq-ant-joao",
      encontro_id: ENC_ANTERIOR,
      inscricao_id: INSC_JOAO,
      presente: false,
      justificativa: "Consulta médica",
      created_at: diasAtras(7),
    },
  ];
}
resetarGrupos();

// ── Leituras ──────────────────────────────────────────────────────────
export function listarAcoes(unitId?: string): AcaoMock[] {
  return acoes
    .filter((a) => !unitId || a.unit_id === unitId)
    .map((a) => ({ ...a, total_inscritos: inscritosAtivos(a.id) }))
    .sort((a, b) => (a.data_inicio < b.data_inicio ? 1 : -1));
}

export function obterAcao(id: string): AcaoMock | undefined {
  const a = acoes.find((x) => x.id === id);
  return a ? { ...a, total_inscritos: inscritosAtivos(a.id) } : undefined;
}

function inscritosAtivos(acaoId: string): number {
  return inscricoes.filter((i) => i.acao_coletiva_id === acaoId && i.status === "ATIVA").length;
}

export function listarInscricoes(acaoId: string): InscricaoMock[] {
  return inscricoes
    .filter((i) => i.acao_coletiva_id === acaoId)
    .sort((a, b) => (a.data_inscricao < b.data_inscricao ? -1 : 1));
}

export function listarEncontros(acaoId: string): EncontroMock[] {
  return encontros
    .filter((e) => e.acao_coletiva_id === acaoId)
    .map((e) => ({
      ...e,
      total_presentes: frequencias.filter((f) => f.encontro_id === e.id && f.presente).length,
      total_faltas: frequencias.filter((f) => f.encontro_id === e.id && !f.presente).length,
    }))
    .sort((a, b) => (a.data_encontro < b.data_encontro ? 1 : -1));
}

export function listarFrequencia(encontroId: string): FrequenciaMock[] {
  return frequencias.filter((f) => f.encontro_id === encontroId);
}

// ── Escritas ──────────────────────────────────────────────────────────
export function inscrever(acaoId: string, personId: string, familyId: string | null): InscricaoMock | null {
  const acao = acoes.find((a) => a.id === acaoId);
  if (!acao) return null;
  if (inscricoes.some((i) => i.acao_coletiva_id === acaoId && i.person_id === personId && i.status === "ATIVA")) {
    return null; // já inscrita → o handler devolve 409
  }
  const agora = new Date().toISOString();
  const semVaga = acao.vagas_disponiveis !== null && acao.vagas_disponiveis <= 0;
  const i: InscricaoMock = {
    id: `insc-${crypto.randomUUID()}`,
    acao_coletiva_id: acaoId,
    person_id: personId,
    family_id: familyId,
    data_inscricao: agora,
    status: semVaga ? "LISTA_ESPERA" : "ATIVA",
    motivo_desligamento: null,
    created_at: agora,
  };
  inscricoes.push(i);
  if (i.status === "ATIVA" && acao.vagas_disponiveis !== null) acao.vagas_disponiveis -= 1;
  return i;
}

export function criarEncontro(acaoId: string, dataEncontro: string, tema: string | null): EncontroMock | null {
  const acao = acoes.find((a) => a.id === acaoId);
  if (!acao) return null;
  const agora = new Date().toISOString();
  const e: EncontroMock = {
    id: `enc-${crypto.randomUUID()}`,
    acao_coletiva_id: acaoId,
    data_encontro: dataEncontro,
    tema,
    observacoes: null,
    total_presentes: 0,
    total_faltas: 0,
    created_at: agora,
  };
  encontros.push(e);
  return e;
}

export function registrarFrequencia(
  encontroId: string,
  registros: { inscricao_id: string; presente: boolean; justificativa: string | null }[],
): FrequenciaMock[] {
  const out: FrequenciaMock[] = [];
  for (const r of registros) {
    const existente = frequencias.find(
      (f) => f.encontro_id === encontroId && f.inscricao_id === r.inscricao_id,
    );
    if (existente) {
      existente.presente = r.presente;
      existente.justificativa = r.justificativa;
      out.push(existente);
    } else {
      const f: FrequenciaMock = {
        id: `freq-${crypto.randomUUID()}`,
        encontro_id: encontroId,
        inscricao_id: r.inscricao_id,
        presente: r.presente,
        justificativa: r.justificativa,
        created_at: new Date().toISOString(),
      };
      frequencias.push(f);
      out.push(f);
    }
  }
  return out;
}

export function encontroExiste(encontroId: string): boolean {
  return encontros.some((e) => e.id === encontroId);
}
