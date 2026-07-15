import { FAMILIA } from "./novaEsperanca";

/**
 * Fixtures de prontuário/atendimentos para a Trilha (Fase 3), fiéis aos DTOs.
 * A evolução só aparece no GET do atendimento e apenas quando concedida — aqui
 * simulamos: um atendimento legível, um sigiloso reforçado e um de outra unidade
 * (visão de rede, sem conteúdo).
 */

export const CASE_FILE_PAIF = {
  id: "cf01-paif-000000000000",
  family_id: FAMILIA.id,
  unit_id: "u-cras-norte",
  service_type_code: "PAIF",
  status: "ATIVO",
  acolhida_data: "2024-01-10",
  aberto_em: "2024-01-10T13:02:00Z",
  created_at: "2024-01-10T13:02:00Z",
};

// Atendimentos da unidade acessível (CRAS Norte).
export const ATENDIMENTOS = [
  {
    id: "att-2026-07-04",
    case_file_id: CASE_FILE_PAIF.id,
    unit_id: "u-cras-norte",
    service_type_code: "PAIF",
    data_atendimento: "2026-07-04T17:20:00Z",
    tipo: "FAMILIAR",
    sigiloso_reforcado: false,
    registrado_por_id: "prof-carla",
    evolution_text:
      "Acolhida realizada. Família em acompanhamento PAIF. Encaminhada avaliação do BPC da idosa Tereza. Próximo retorno em 30 dias.",
    evolution_restrita: false,
  },
  {
    id: "att-2026-06-20",
    case_file_id: CASE_FILE_PAIF.id,
    unit_id: "u-cras-norte",
    service_type_code: "PAIF",
    data_atendimento: "2026-06-20T14:05:00Z",
    tipo: "VISITA_DOMICILIAR",
    sigiloso_reforcado: true,
    registrado_por_id: "prof-carla",
    // Sigilo reforçado: para outros perfis viria restrita; no mock, legível para
    // quem registrou (perfil padrão técnico) — o campo controla a UI.
    evolution_text:
      "Visita domiciliar. Observadas condições de moradia adequadas. Situação de conflito familiar em acompanhamento reservado.",
    evolution_restrita: false,
  },
];

export const TIMELINE = ATENDIMENTOS.map((a) => ({
  attendance_id: a.id,
  data_atendimento: a.data_atendimento,
  tipo: a.tipo,
  service_type_code: a.service_type_code,
  unit_id: a.unit_id,
  sigiloso_reforcado: a.sigiloso_reforcado,
  pode_ler_evolucao: !a.evolution_restrita,
}));

// Visão de rede: inclui os do CRAS Norte + um do CREAS (outra unidade, sem conteúdo).
export const REDE = [
  ...ATENDIMENTOS.map((a) => ({
    unit_id: a.unit_id,
    unit_nome: "CRAS Norte",
    service_type_code: a.service_type_code,
    data_atendimento: a.data_atendimento,
    tipo: a.tipo,
  })),
  {
    unit_id: "u-creas",
    unit_nome: "CREAS Municipal",
    service_type_code: "PAEFI",
    data_atendimento: "2026-06-15T10:00:00Z",
    tipo: "INDIVIDUAL",
  },
];

export function atendimentoPorId(id: string) {
  const criado = ATENDIMENTOS_CRIADOS.find((a) => a.id === id);
  if (criado) return criado;
  return ATENDIMENTOS.find((a) => a.id === id);
}

/** Tipos de serviço (domínio) para o seletor do registro de atendimento. */
export const SERVICE_TYPES = [
  {
    id: "st-paif",
    code: "PAIF",
    nome: "Proteção e Atendimento Integral à Família",
    source: "NACIONAL",
    vigencia_inicio: "2020-01-01",
    vigencia_fim: null,
    ativo: true,
    sigla: "PAIF",
    protecao: "BASICA",
  },
  {
    id: "st-scfv",
    code: "SCFV",
    nome: "Serviço de Convivência e Fortalecimento de Vínculos",
    source: "NACIONAL",
    vigencia_inicio: "2020-01-01",
    vigencia_fim: null,
    ativo: true,
    sigla: "SCFV",
    protecao: "BASICA",
  },
];

// ── Store dinâmico do mock (prontuários e atendimentos criados) ──────
type CaseFileMock = {
  id: string;
  family_id: string;
  unit_id: string;
  service_type_code: string;
  status: string;
  acolhida_data: string | null;
  aberto_em: string;
  created_at: string;
};
type AtendimentoMock = {
  id: string;
  case_file_id: string;
  unit_id: string;
  service_type_code: string;
  data_atendimento: string;
  tipo: string;
  sigiloso_reforcado: boolean;
  registrado_por_id: string | null;
  evolution_text: string | null;
  evolution_restrita: boolean;
};

const CASE_FILES_CRIADOS: CaseFileMock[] = [];
const ATENDIMENTOS_CRIADOS: AtendimentoMock[] = [];

export function listarCaseFiles(familyId: string, unitId?: string): CaseFileMock[] {
  const todos = [CASE_FILE_PAIF, ...CASE_FILES_CRIADOS].filter(
    (c) => c.family_id === familyId && (!unitId || c.unit_id === unitId),
  );
  return todos;
}

export function criarCaseFile(
  familyId: string,
  unitId: string,
  serviceTypeCode: string,
): CaseFileMock {
  const cf: CaseFileMock = {
    id: `cf-${crypto.randomUUID()}`,
    family_id: familyId,
    unit_id: unitId,
    service_type_code: serviceTypeCode,
    status: "ATIVO",
    acolhida_data: null,
    aberto_em: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };
  CASE_FILES_CRIADOS.push(cf);
  return cf;
}

export function criarAtendimentoMock(
  caseFileId: string,
  unitId: string,
  serviceCode: string,
  body: {
    data_atendimento: string;
    tipo: string;
    evolution_text: string | null;
    sigiloso_reforcado: boolean;
    member_ids?: string[];
    professional_ids?: string[];
  },
): AtendimentoMock {
  const att: AtendimentoMock = {
    id: `att-${crypto.randomUUID()}`,
    case_file_id: caseFileId,
    unit_id: unitId,
    service_type_code: serviceCode,
    data_atendimento: body.data_atendimento,
    tipo: body.tipo,
    sigiloso_reforcado: body.sigiloso_reforcado,
    registrado_por_id: "prof-carla",
    evolution_text: body.evolution_text,
    evolution_restrita: false,
  };
  ATENDIMENTOS_CRIADOS.push(att);
  return att;
}

export function serviceCodeDoCaseFile(caseFileId: string): { unitId: string; code: string } | null {
  const cf = [CASE_FILE_PAIF, ...CASE_FILES_CRIADOS].find((c) => c.id === caseFileId);
  return cf ? { unitId: cf.unit_id, code: cf.service_type_code } : null;
}

/** Itens de timeline dos atendimentos criados no mock, para um prontuário. */
export function timelineDinamica(caseFileId: string) {
  return ATENDIMENTOS_CRIADOS.filter((a) => a.case_file_id === caseFileId)
    .sort((a, b) => (a.data_atendimento < b.data_atendimento ? 1 : -1))
    .map((a) => ({
      attendance_id: a.id,
      data_atendimento: a.data_atendimento,
      tipo: a.tipo,
      service_type_code: a.service_type_code,
      unit_id: a.unit_id,
      sigiloso_reforcado: a.sigiloso_reforcado,
      pode_ler_evolucao: !a.evolution_restrita,
    }));
}
