/**
 * DTOs do prontuário (case-files) e atendimentos — espelham o backend
 * (`app/schemas/prontuario.py`). Evolução técnica NUNCA trafega em listagens;
 * só no GET de um atendimento e apenas quando a política concede.
 */

export type TimelineItem = {
  attendance_id: string;
  data_atendimento: string;
  tipo: string;
  service_type_code: string;
  sigiloso_reforcado: boolean;
  pode_ler_evolucao: boolean;
  unit_id?: string;
  registrado_por_id?: string;
  registrado_por_nome?: string;
  situacao?: string;
  evolution_text?: string;
  member_ids?: string[];
};

export type CaseFileOut = {
  id: string;
  family_id: string;
  unit_id: string;
  service_type_code: string;
  status: string;
  acolhida_data?: string | null;
  acolhida_access_form_code?: string | null;
  acolhida_motivo?: string | null;
  acolhida_profissional_id?: string | null;
  aberto_em: string;
  created_at: string;
  updated_at: string;
};

export type AttendanceOut = {
  id: string;
  case_file_id: string;
  unit_id: string;
  service_type_code: string;
  data_atendimento: string;
  tipo: string;
  sigiloso_reforcado: boolean;
  registrado_por_id?: string | null;
  member_ids: string[];
  professional_ids: string[];
  /** Só é preenchida quando o usuário tem permissão de leitura. */
  evolution_text?: string | null;
  evolution_restrita: boolean;
  created_at: string;
  updated_at: string;
};

export type NetworkViewItem = {
  unit_id: string;
  unit_nome?: string | null;
  service_type_code: string;
  data_atendimento: string;
  tipo: string;
};

export type CaseFileListItem = {
  id: string;
  family_id: string;
  unit_id: string;
  service_type_code: string;
  status: string;
  acolhida_data?: string | null;
  aberto_em: string;
  created_at: string;
};

/** Motivos de desligamento do acompanhamento (alimentam o RMA do mês). */
export type MotivoDesligamento =
  | "OBJETIVOS_ALCANCADOS"
  | "MUDANCA_TERRITORIO"
  | "NAO_ADESAO"
  | "OBITO"
  | "ENCAMINHAMENTO_REDE"
  | "MEDIDA_ENCERRADA"
  | "TRANSFERENCIA_UNIDADE"
  | "OUTRO";
