export type TipoNotificacao =
  | "PRAZO_PROXIMO"
  | "PRAZO_VENCIDO"
  | "TAREFA_ATRIBUIDA"
  | "TAREFA_ENTREGUE"
  | "TAREFA_DEVOLVIDA"
  | "CONTESTACAO_ABERTA"
  | "CONTESTACAO_DECIDIDA";

export type CanalNotificacao = "IN_APP" | "EMAIL";

export interface Notificacao {
  id: string;
  destinatario_id: string;
  tipo: TipoNotificacao;
  convenio_id: string;
  tarefa_id: string | null;
  mensagem: string;
  canal: CanalNotificacao;
  lida: boolean;
  lida_em: string | null;
  created_at: string;
}
