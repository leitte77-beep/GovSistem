/**
 * DTOs de encaminhamentos (Fase 7) — espelham app/schemas/encaminhamento.py.
 * O campo `devolutiva` (contrarreferência) é conteúdo sensível: só vem no
 * detalhe (GET por id) quando a política concede — nunca em listagens.
 */

export type EncaminhamentoOut = {
  id: string;
  case_file_id: string | null;
  unit_id: string;
  tipo: string; // INTERNO | EXTERNO
  unidade_destino_id: string | null;
  profissional_destino_id: string | null;
  data_aceite: string | null;
  data_devolutiva: string | null;
  referral_code: string | null;
  instituicao_destino: string | null;
  numero_oficio: number | null;
  profissional_origem_id: string | null;
  data_encaminhamento: string;
  motivo: string | null;
  descricao: string | null;
  status: string; // PENDENTE | ACEITO | RECUSADO | DEVOLVIDO | CANCELADO | OFICIO_GERADO
  devolutiva: string | null;
  motivo_recusa: string | null;
  oficio_gerado: boolean;
  created_at: string;
  updated_at: string;
};

export type EncaminhamentoListItem = {
  id: string;
  case_file_id: string | null;
  unit_id: string;
  tipo: string;
  unidade_destino_id: string | null;
  referral_code: string | null;
  instituicao_destino: string | null;
  data_encaminhamento: string;
  status: string;
  numero_oficio: number | null;
};

export type EncaminhamentoCreate = {
  case_file_id?: string | null;
  unit_id: string;
  tipo: string;
  unidade_destino_id?: string | null;
  profissional_destino_id?: string | null;
  referral_code?: string | null;
  instituicao_destino?: string | null;
  profissional_origem_id?: string | null;
  motivo?: string | null;
  descricao?: string | null;
};
