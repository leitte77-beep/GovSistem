/** DTOs de benefícios eventuais — espelham app/schemas/beneficios.py. */

export type StatusConcessao =
  | "SOLICITADO"
  | "EM_ANALISE"
  | "APROVADO"
  | "ENTREGUE"
  | "NEGADO"
  | "CANCELADO";

export type ConcessaoOut = {
  id: string;
  family_id: string;
  person_id: string | null;
  unit_id: string;
  benefit_type_code: string;
  quantidade: number;
  valor_total: number | null;
  status: StatusConcessao;
  data_solicitacao: string;
  data_analise: string | null;
  data_aprovacao: string | null;
  data_entrega: string | null;
  solicitado_por_id: string | null;
  analisado_por_id: string | null;
  aprovado_por_id: string | null;
  // Parecer é sensível: só vem quando concedido (parecer_restrito sinaliza omissão).
  parecer: string | null;
  parecer_restrito: boolean;
  motivo_negacao: string | null;
  comprovante_gerado: boolean;
  assinatura_data: string | null;
  created_at: string;
  updated_at: string;
};

export type ConcessaoListItem = {
  id: string;
  family_id: string;
  unit_id: string;
  benefit_type_code: string;
  status: StatusConcessao;
  data_solicitacao: string;
  valor_total: number | null;
};

export type ConcessaoCreate = {
  family_id: string;
  person_id?: string | null;
  unit_id: string;
  benefit_type_code: string;
  quantidade: number;
  valor_total?: number | null;
  solicitado_por_id?: string | null;
};
