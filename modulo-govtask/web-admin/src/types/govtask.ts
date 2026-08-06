export type TipoConvenio = "OBRA" | "AQUISICAO" | "SERVICO" | "OUTRO";
export type StatusConvenio = "RASCUNHO" | "EM_ANDAMENTO" | "SUSPENSO" | "CONCLUIDO" | "CANCELADO";
export type NaturezaEtapa = "INTERNA" | "GOVERNO";
export type StatusEtapa = "PENDENTE" | "EM_ANDAMENTO" | "AGUARDANDO_GOVERNO" | "CONCLUIDA" | "BLOQUEADA";
export type TipoDocumento = "OFICIO" | "PROJETO" | "EDITAL" | "CONTRATO" | "FOTO" | "MEDICAO" | "OUTRO";

export interface ConvenioListItem {
  id: string;
  titulo: string;
  tipo: TipoConvenio;
  origem: string | null;
  numero_protocolo_governo: string | null;
  valor: number | null;
  status: StatusConvenio;
  etapa_atual: string | null;
  proximo_prazo: string | null;
  responsavel: { id: string; name: string } | null;
  created_at: string;
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
  tarefas?: TarefaListItem[];
  anexos?: Anexo[];
}

export interface Convenio extends ConvenioListItem {
  descricao: string | null;
  data_protocolo: string | null;
  template_fluxo_id: string | null;
  responsavel_id: string | null;
  updated_at: string;
  etapas: Etapa[];
  tarefas: TarefaListItem[];
  anexos: Anexo[];
}

export interface TimelineEvent {
  id: string;
  tipo_evento: string;
  ator: { id: string; name: string } | null;
  descricao: string;
  metadados: Record<string, unknown> | null;
  ocorrido_em: string;
  tarefa_id: string | null;
}

export interface Anexo {
  id: string;
  nome_arquivo: string;
  tipo_documento: TipoDocumento;
  tamanho_bytes: number;
  versao: number;
  storage_path: string;
  enviado_por: { id: string; name: string } | null;
  created_at: string;
}

export type PrioridadeTarefa = "BAIXA" | "NORMAL" | "ALTA" | "URGENTE";
export type StatusTarefa = "AGUARDANDO_ACEITE" | "EM_ANDAMENTO" | "ENTREGUE" | "DEVOLVIDA" | "CONTESTADA" | "CONCLUIDA" | "CANCELADA";

export interface TarefaListItem {
  id: string;
  titulo: string;
  status: StatusTarefa;
  prioridade: string;
  prazo: string | null;
  atribuida_a: { id: string; name: string } | null;
  etapa?: { id: string; nome: string } | null;
  convenio?: { id: string; titulo: string } | null;
  atrasada: boolean;
  created_at: string;
}

export interface Comentario {
  id: string;
  texto: string;
  autor: { id: string; name: string } | null;
  created_at: string;
}

export interface Contestacao {
  id: string;
  motivo: string;
  novo_prazo_solicitado: string;
  status: "PENDENTE" | "APROVADA" | "REJEITADA";
  solicitado_por: { id: string; name: string } | null;
  decidido_por: { id: string; name: string } | null;
  justificativa_decisao: string | null;
  data_decisao: string | null;
  created_at: string;
}

export interface Tarefa extends TarefaListItem {
  descricao: string | null;
  criada_por: { id: string; name: string } | null;
  setor_destino: { id: string; nome: string } | null;
  etapa_id: string | null;
  convenio_id: string;
  data_aceite: string | null;
  data_entrega: string | null;
  data_conclusao: string | null;
  anexos: Anexo[];
  comentarios: Comentario[];
  contestacoes: Contestacao[];
  eventos: TimelineEvent[];
}

export interface Notificacao {
  id: string;
  tipo: string;
  mensagem: string;
  lida: boolean;
  lida_em: string | null;
  convenio_id: string | null;
  tarefa_id: string | null;
  created_at: string;
}

export interface Setor {
  id: string;
  nome: string;
  sigla: string | null;
  descricao?: string | null;
  ativo: boolean;
}

export interface TemplateEtapa {
  id?: string;
  nome: string;
  ordem: number;
  natureza: NaturezaEtapa;
}

export interface TemplateFluxo {
  id: string;
  nome: string;
  tipo_convenio: string;
  descricao: string | null;
  etapas: TemplateEtapa[];
}

export interface DashboardData {
  convenios_ativos: number;
  tarefas_abertas: number;
  tarefas_atrasadas: number;
  contestações_pendentes: number;
  aguardando_governo: number;
  tarefas_atribuidas: number;
  tarefas_entregues: number;
  prazos_proximos: { item: string; prazo: string; link: string }[];
  atividade_recente: { descricao: string; time: string }[];
  convenios_por_etapa: { nome: string; count: number }[];
  acoes_necessarias: { tipo: string; item: string; descricao: string; link: string }[];
}
