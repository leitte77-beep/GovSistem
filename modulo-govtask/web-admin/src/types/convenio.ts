export type TipoConvenio = "OBRA" | "AQUISICAO" | "SERVICO" | "OUTRO";
export type StatusConvenio =
  | "RASCUNHO"
  | "EM_ANDAMENTO"
  | "SUSPENSO"
  | "CONCLUIDO"
  | "CANCELADO";
export type NaturezaEtapa = "INTERNA" | "GOVERNO";
export type StatusEtapa =
  | "PENDENTE"
  | "EM_ANDAMENTO"
  | "AGUARDANDO_GOVERNO"
  | "CONCLUIDA"
  | "BLOQUEADA";
export type TipoDocumento =
  | "OFICIO"
  | "PROJETO"
  | "EDITAL"
  | "CONTRATO"
  | "FOTO"
  | "MEDICAO"
  | "OUTRO";

export interface Convenio {
  id: string;
  titulo: string;
  descricao: string | null;
  tipo: TipoConvenio;
  origem: string | null;
  numero_protocolo_governo: string | null;
  valor: number | null;
  status: StatusConvenio;
  data_protocolo: string | null;
  responsavel_id: string;
  template_fluxo_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConvenioListItem {
  id: string;
  titulo: string;
  tipo: TipoConvenio;
  numero_protocolo_governo: string | null;
  status: StatusConvenio;
  responsavel_id: string;
  created_at: string;
  updated_at: string;
}

export interface Etapa {
  id: string;
  convenio_id: string;
  nome: string;
  ordem: number;
  natureza: NaturezaEtapa;
  status: StatusEtapa;
  prazo_governo: string | null;
  resposta_governo: string | null;
  data_inicio: string | null;
  data_conclusao: string | null;
  created_at: string;
  updated_at: string;
}

export interface TimelineEvent {
  id: string;
  tipo_evento: string;
  ator_id: string;
  descricao: string;
  metadados: Record<string, unknown> | null;
  ocorrido_em: string;
  tarefa_id: string | null;
}

export interface Anexo {
  id: string;
  convenio_id: string;
  etapa_id: string | null;
  tarefa_id: string | null;
  nome_arquivo: string;
  tipo_documento: TipoDocumento;
  storage_path: string;
  tamanho_bytes: number;
  versao: number;
  enviado_por_id: string;
  created_at: string;
}
