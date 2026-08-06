/** DTOs de grupos/SCFV e frequência — espelham app/schemas/acoes_coletivas.py. */

export type AcaoColetivaOut = {
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

export type InscricaoOut = {
  id: string;
  acao_coletiva_id: string;
  person_id: string;
  family_id: string | null;
  data_inscricao: string;
  status: string; // ATIVA | LISTA_ESPERA | DESLIGADA
  motivo_desligamento: string | null;
  created_at: string;
};

export type EncontroOut = {
  id: string;
  acao_coletiva_id: string;
  data_encontro: string;
  tema: string | null;
  observacoes: string | null;
  total_presentes: number;
  total_faltas: number;
  created_at: string;
};

export type FrequenciaOut = {
  id: string;
  encontro_id: string;
  inscricao_id: string;
  presente: boolean;
  justificativa: string | null;
  created_at: string;
};

/** Registro individual enviado no upsert em lote de frequência. */
export type FrequenciaRegistro = {
  inscricao_id: string;
  presente: boolean;
  justificativa: string | null;
};
