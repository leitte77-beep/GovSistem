/**
 * DTOs de prontuário e atendimentos — espelham app/schemas/prontuario.py.
 * A evolução técnica NUNCA vem em listagem/timeline; só no GET de um atendimento
 * e apenas quando a política concede (evolution_restrita sinaliza omissão).
 */

export type CaseFileListItem = {
  id: string;
  family_id: string;
  unit_id: string;
  service_type_code: string;
  status: string;
  acolhida_data: string | null;
  aberto_em: string;
  created_at: string;
};

export type CaseFileOut = {
  id: string;
  family_id: string;
  unit_id: string;
  service_type_code: string;
  status: string;
  acolhida_data: string | null;
  acolhida_access_form_code: string | null;
  acolhida_motivo: string | null;
  acolhida_profissional_id: string | null;
  aberto_em: string;
  created_at: string;
  updated_at: string;
};

export type MotivoDesligamento =
  | "OBJETIVOS_ALCANCADOS"
  | "MUDANCA_TERRITORIO"
  | "NAO_ADESAO"
  | "OBITO"
  | "ENCAMINHAMENTO_REDE"
  | "MEDIDA_ENCERRADA"
  | "TRANSFERENCIA_UNIDADE"
  | "OUTRO";

export type CaseFileEncerrar = {
  motivo_desligamento: MotivoDesligamento;
  data_fim?: string;
  observacoes?: string;
};

export type TipoAtendimento =
  | "INDIVIDUAL"
  | "FAMILIAR"
  | "GRUPO"
  | "VISITA_DOMICILIAR"
  | "ACAO_COLETIVA";

export type TimelineItem = {
  attendance_id: string;
  data_atendimento: string;
  tipo: string;
  service_type_code: string;
  unit_id: string;
  sigiloso_reforcado: boolean;
  pode_ler_evolucao: boolean;
};

export type AttendanceOut = {
  id: string;
  case_file_id: string;
  unit_id: string;
  service_type_code: string;
  data_atendimento: string;
  tipo: string;
  sigiloso_reforcado: boolean;
  registrado_por_id: string | null;
  member_ids: string[];
  professional_ids: string[];
  // Só preenchida quando o usuário tem permissão de leitura.
  evolution_text: string | null;
  evolution_restrita: boolean;
  created_at: string;
  updated_at: string;
};

/** Visão de rede: existência do atendimento em outra unidade, sem conteúdo. */
export type NetworkViewItem = {
  unit_id: string;
  unit_nome: string | null;
  service_type_code: string;
  data_atendimento: string;
  tipo: string;
};
