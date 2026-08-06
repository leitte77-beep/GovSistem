export type Prioridade = "BAIXA" | "NORMAL" | "ALTA" | "URGENTE";
export type StatusTarefa =
  | "AGUARDANDO_ACEITE"
  | "EM_ANDAMENTO"
  | "ENTREGUE"
  | "DEVOLVIDA"
  | "CONTESTADA"
  | "CONCLUIDA"
  | "CANCELADA";
export type StatusContestacao = "PENDENTE" | "APROVADA" | "REJEITADA";

export interface Tarefa {
  id: string;
  convenio_id: string;
  etapa_id: string;
  titulo: string;
  descricao: string | null;
  criada_por_id: string;
  atribuida_a_id: string | null;
  setor_destino_id: string | null;
  prioridade: Prioridade;
  prazo: string;
  status: StatusTarefa;
  tarefa_pai_id: string | null;
  data_aceite: string | null;
  data_entrega: string | null;
  data_conclusao: string | null;
  recorrente: boolean;
  atrasada: boolean;
  created_at: string;
  updated_at: string;
}

export interface TarefaListItem {
  id: string;
  convenio_id: string;
  etapa_id: string;
  titulo: string;
  atribuida_a_id: string | null;
  setor_destino_id: string | null;
  prioridade: Prioridade;
  prazo: string;
  status: StatusTarefa;
  atrasada: boolean;
  recorrente: boolean;
  created_at: string;
}

export interface Comentario {
  id: string;
  tarefa_id: string;
  autor_id: string;
  texto: string;
  created_at: string;
}

export interface Contestacao {
  id: string;
  tarefa_id: string;
  solicitado_por_id: string;
  motivo: string;
  novo_prazo_solicitado: string;
  status: StatusContestacao;
  decidido_por_id: string | null;
  justificativa_decisao: string | null;
  data_decisao: string | null;
  created_at: string;
}
