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
  categoria: string | null;
  esfera: string | null;
  situacao: string | null;
  prioridade?: string | null;
  numero_emenda?: string | null;
  parlamentar: string | null;
  orgao_concedente: string | null;
  etapa_atual: string | null;
  proximo_prazo: string | null;
  percentual_fisico?: number | null;
  percentual_financeiro?: number | null;
  percentual_administrativo?: number | null;
  tarefas_abertas?: number;
  tarefas_atrasadas?: number;
  valor_recebido?: number | null;
  ultima_movimentacao?: string | null;
  pendencias?: number;
  responsavel?: { id: string; name: string } | null;
  responsavel_id?: string | null;
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
  prioridade: string | null;
  parlamentar_cargo: string | null;
  partido: string | null;
  programa: string | null;
  finalidade: string | null;
  numero_proposta: string | null;
  numero_instrumento: string | null;
  numero_convenio: string | null;
  numero_contrato_repasse: string | null;
  numero_emenda: string | null;
  numero_plano_acao: string | null;
  numero_plano_trabalho: string | null;
  valor_solicitado: number | null;
  valor_aprovado: number | null;
  valor_repasse: number | null;
  contrapartida: number | null;
  valor_executado: number | null;
  valor_pago: number | null;
  saldo: number | null;
  data_aprovacao: string | null;
  data_assinatura: string | null;
  vigencia_inicio: string | null;
  vigencia_fim: string | null;
  prazo_execucao: string | null;
  prazo_prestacao_contas: string | null;
  previsao_conclusao: string | null;
  conclusao_efetiva: string | null;
  gestor_id: string | null;
  fiscal_id: string | null;
  engenheiro_id: string | null;
  links_externos: Record<string, unknown> | null;
  identificadores_externos: Record<string, unknown> | null;
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
  categoria: CategoriaDocumento;
  classificacao: ClassificacaoDocumento;
  descricao: string | null;
  tamanho_bytes: number;
  versao: number;
  storage_path: string;
  motivo_versao: string | null;
  enviado_externo: boolean;
  enviado_externo_data: string | null;
  enviado_externo_sistema: string | null;
  enviado_externo_protocolo: string | null;
  enviado_externo_observacao: string | null;
  enviado_por: { id: string; name: string } | null;
  created_at: string;
}

export type PrioridadeTarefa = "BAIXA" | "NORMAL" | "ALTA" | "URGENTE";
export type StatusTarefa = "AGUARDANDO_ACEITE" | "EM_ANDAMENTO" | "ENTREGUE" | "DEVOLVIDA" | "CONTESTADA" | "CONCLUIDA" | "CANCELADA";

export interface TarefaListItem {
  id: string;
  convenio_id?: string;
  etapa_id?: string | null;
  titulo: string;
  descricao?: string | null;
  status: StatusTarefa;
  prioridade: string;
  prazo: string | null;
  prazo_interno?: string | null;
  atribuida_a: { id: string; name: string } | null;
  setor_destino?: { id: string; nome: string } | null;
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
  prazo_interno: string | null;
  bloqueada_por: string[];
  historico_prazos: { id: string; prazo_anterior: string | null; prazo_novo: string | null; definido_por_id: string; motivo: string | null; tipo: string; created_at: string }[];
  anexos: Anexo[];
  comentarios: Comentario[];
  contestacoes: Contestacao[];
  eventos: TimelineEvent[];
}

export interface Notificacao {
  id: string;
  destinatario_id?: string;
  tipo: string;
  mensagem: string;
  lida: boolean;
  lida_em: string | null;
  // A notificação se prende a uma demanda (núcleo v2) ou a um convênio
  // (entidades anteriores); no núcleo novo o convênio é nulo.
  convenio_id: string | null;
  demanda_id?: string | null;
  tarefa_id: string | null;
  canal?: "IN_APP" | "EMAIL";
  created_at: string;
}

export interface PreferenciaNotificacao {
  email_ativo: boolean;
  tipos_email: string[];
  tipos_disponiveis: string[];
  tipos_obrigatorios: string[];
  canal_configurado: boolean;
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
  atividade_recente: { descricao: string; ator?: string | null; time: string }[];
  convenios_por_etapa: { nome: string; count: number }[];
  acoes_necessarias: { tipo: string; item: string; descricao: string; link: string }[];
  valor_aprovado: number;
  valor_captado: number;
  valor_executado: number;
  valor_pago: number;
  obras_em_andamento: number;
  diligencias_abertas: number;
  prestacoes_pendentes: number;
  processos_por_situacao: { nome: string; count: number }[];
}

export interface DemandaV2 {
  id: string; numero: string; titulo: string; prioridade: string; progresso: number;
  prazo_final: string | null; ultima_movimentacao_em: string; bloqueada: boolean;
  atrasada: boolean; dias_sem_movimentacao: number; concluida_em: string | null;
  descricao?: string | null; objeto?: string | null; resumo_executivo?: string | null;
  proxima_acao?: string | null; proxima_acao_prazo?: string | null;
  bloqueio_motivo?: string | null; aguardando_terceiro?: string | null;
  tipo?: { rotulo: string } | null; categoria?: { rotulo: string } | null;
  status?: { rotulo: string; cor?: string | null } | null;
  responsavel_geral?: { id: string; name: string } | null;
  responsavel_atual?: { id: string; name: string } | null;
  setor_atual?: { id: string; nome: string } | null; tags: string[];
  seguindo?: boolean; favorito?: boolean;
}

export interface DemandaV2Page { items: DemandaV2[]; total: number; page: number; pages: number; page_size: number; }

// ── Gestão de Recursos: novas entidades ───────────────────

export type OrigemDiligencia = "GOVERNO_FEDERAL" | "GOVERNO_ESTADUAL" | "CONCEDENTE" | "MANDATARIA" | "CONTROLE_INTERNO" | "OUTRO";
export type StatusDiligencia = "RECEBIDA" | "DISTRIBUIDA" | "EM_ATENDIMENTO" | "RESPONDIDA_INTERNAMENTE" | "PROTOCOLADA" | "ACEITA" | "NOVA_CORRECAO_SOLICITADA" | "ENCERRADA";
export type StatusRepasse = "PREVISTO" | "RECEBIDO" | "ATRASADO" | "CANCELADO";
export type StatusMedicao = "REGISTRADA" | "EM_ANALISE" | "APROVADA" | "REPROVADA" | "PAGA";
export type TipoMovimento = "EMPENHO" | "LIQUIDACAO" | "PAGAMENTO" | "REPASSE_RECEBIDO" | "RENDIMENTO" | "DEVOLUCAO" | "OUTRO";
export type StatusContrato = "RASCUNHO" | "ASSINADO" | "EM_VIGENCIA" | "CONCLUIDO" | "ENCERRADO" | "RESCINDIDO";
export type TipoAditivo = "PRAZO" | "VALOR" | "OBJETO" | "OUTRO";
export type StatusLicitacao = "PREPARATORIA" | "EDITAL_PUBLICADO" | "EM_DISPUTA" | "JULGAMENTO" | "HOMOLOGADA" | "ADJUDICADA" | "ANULADA" | "DESERTA";
export type StatusPrestacao = "EM_PREPARACAO" | "PRONTA" | "ENVIADA" | "EM_ANALISE" | "EM_DILIGENCIA" | "APROVADA" | "APROVADA_COM_OBSERVACAO" | "REJEITADA" | "ENCERRADA";
export type StatusEntrega = "REGISTRADA" | "RECEBIMENTO_PROVISORIO" | "RECEBIMENTO_DEFINITIVO" | "INAUGURADA" | "ENCERRADA";
export type CategoriaDocumento = "PROPOSTA" | "JURIDICO" | "ENGENHARIA" | "LICITACAO" | "CONTRATO" | "EXECUCAO" | "MEDICOES" | "FINANCEIRO" | "PRESTACAO_CONTAS" | "FOTOS" | "DOCUMENTOS_EXTERNOS" | "OUTROS";
export type ClassificacaoDocumento = "PUBLICO" | "INTERNO" | "RESTRITO" | "SIGILOSO";

export interface Diligencia {
  id: string;
  convenio_id: string;
  origem: OrigemDiligencia;
  origem_descricao: string | null;
  data_recebimento: string | null;
  protocolo: string | null;
  descricao: string;
  prazo: string | null;
  responsavel_id: string | null;
  setor_destino_id: string | null;
  status: StatusDiligencia;
  tarefa_id: string | null;
  etapa_id: string | null;
  resposta_interna: string | null;
  resposta_data: string | null;
  resposta_protocolo: string | null;
  data_encerramento: string | null;
  created_at: string;
}

export interface Repasse {
  id: string;
  convenio_id: string;
  parcela: number;
  valor_previsto: number | null;
  valor_recebido: number | null;
  data_prevista: string | null;
  data_recebida: string | null;
  conta_destino: string | null;
  observacao: string | null;
  status: StatusRepasse;
  registrado_por_id: string;
  created_at: string;
}

export interface Medicao {
  id: string;
  convenio_id: string;
  numero: number;
  periodo_inicio: string | null;
  periodo_fim: string | null;
  data: string | null;
  valor: number | null;
  percentual: number | null;
  percentual_acumulado: number | null;
  responsavel_id: string | null;
  observacao: string | null;
  status: StatusMedicao;
  aprovada_por_id: string | null;
  data_aprovacao: string | null;
  created_at: string;
}

export interface MovimentoFinanceiro {
  id: string;
  convenio_id: string;
  tipo: TipoMovimento;
  numero: string | null;
  data: string | null;
  valor: number | null;
  favorecido: string | null;
  descricao: string | null;
  medicao_id: string | null;
  contrato_id: string | null;
  registro_por_id: string;
  created_at: string;
}

export interface ResumoFinanceiro {
  valor_aprovado: number | null;
  valor_recebido: number | null;
  contrapartida: number | null;
  rendimentos: number | null;
  total_disponivel: number | null;
  empenhado: number | null;
  liquidado: number | null;
  pago: number | null;
  saldo: number | null;
  percentual_executado: number | null;
  percentual_pago: number | null;
}

export interface Aditivo {
  id: string;
  contrato_id: string;
  numero: string | null;
  tipo: TipoAditivo;
  motivo: string | null;
  valor: number | null;
  prazo: string | null;
  data: string | null;
  aprovado_por_id: string | null;
  created_at: string;
}

export interface Contrato {
  id: string;
  convenio_id: string;
  numero: string | null;
  fornecedor: string | null;
  cnpj: string | null;
  objeto: string | null;
  valor: number | null;
  data_assinatura: string | null;
  vigencia_inicio: string | null;
  vigencia_fim: string | null;
  fiscal_id: string | null;
  gestor_id: string | null;
  status: StatusContrato;
  aditivos: Aditivo[];
  created_at: string;
  updated_at: string;
}

export interface Licitacao {
  id: string;
  convenio_id: string;
  numero: string | null;
  modalidade: string | null;
  objeto: string | null;
  situacao: StatusLicitacao;
  valor_estimado: number | null;
  valor_contratado: number | null;
  vencedor: string | null;
  cnpj_vencedor: string | null;
  data_disputa: string | null;
  data_homologacao: string | null;
  observacao: string | null;
  created_at: string;
  updated_at: string;
}

export interface PrestacaoItem {
  id: string;
  prestacao_id: string;
  descricao: string;
  conferido: boolean;
  anexo_id?: string | null;
  conferido_por_id: string | null;
  data_conferencia: string | null;
  created_at: string;
}

export interface Prestacao {
  id: string;
  convenio_id: string;
  titulo: string | null;
  status: StatusPrestacao;
  responsavel_id: string | null;
  data_envio: string | null;
  sistema_envio: string | null;
  protocolo: string | null;
  observacao: string | null;
  parecer: string | null;
  data_aprovacao: string | null;
  percentual_preparacao: number;
  itens: PrestacaoItem[];
  created_at: string;
  updated_at: string;
}

export interface EntregaObjeto {
  id: string;
  convenio_id: string;
  tipo: string;
  fornecedor: string | null;
  data_entrega: string | null;
  nota_fiscal: string | null;
  quantidade: number | null;
  identificacao: string | null;
  patrimonio: string | null;
  placa: string | null;
  chassi: string | null;
  modelo: string | null;
  local_entrega: string | null;
  responsavel_recebimento_id: string | null;
  termo_recebimento: boolean;
  observacao: string | null;
  status: StatusEntrega;
  created_at: string;
}

export interface AuditoriaRegistro {
  id: string;
  organization_id: string | null;
  user_id: string | null;
  convenio_id: string | null;
  acao: string;
  entidade: string | null;
  entidade_id: string | null;
  dados_anteriores: Record<string, unknown> | null;
  dados_posteriores: Record<string, unknown> | null;
  ip: string | null;
  user_agent: string | null;
  ocorrido_em: string;
}

// ── Engenharia / Obra ─────────────────────────────────────
export interface CronogramaItem {
  id: string;
  obra_id: string;
  descricao: string;
  valor: number | null;
  percentual_previsto: number | null;
  percentual_realizado: number | null;
  data_inicio_prevista: string | null;
  data_fim_prevista: string | null;
  ordem: number;
  created_at: string;
}

export interface Obra {
  id: string;
  // A obra pende de um convênio (entidades anteriores à v2) ou de uma demanda
  // (§54); pelo menos um dos dois está preenchido.
  convenio_id: string | null;
  demanda_id?: string | null;
  nome: string | null;
  endereco: string | null;
  coordenadas: string | null;
  objeto: string | null;
  empresa: string | null;
  cnpj_empresa: string | null;
  contrato_numero: string | null;
  responsavel_tecnico: string | null;
  fiscal_id: string | null;
  gestor_id: string | null;
  data_inicio: string | null;
  previsao_conclusao: string | null;
  valor_contrato: number | null;
  situacao: string | null;
  percentual_fisico: number | null;
  percentual_financeiro: number | null;
  observacoes: string | null;
  cronograma: CronogramaItem[];
  created_at: string;
  updated_at: string;
}

export interface DiarioObra {
  id: string;
  obra_id: string;
  tipo: string;
  data: string | null;
  titulo: string | null;
  descricao: string | null;
  clima?: string | null;
  temperatura?: string | null;
  efetivo?: number | null;
  equipe?: string | null;
  atividades?: string | null;
  equipamentos?: string | null;
  ocorrencias?: string | null;
  impedimentos?: string | null;
  registrado_por_id: string | null;
  created_at: string;
}

export interface RegistroFoto {
  id: string;
  obra_id: string;
  data: string | null;
  observacao: string | null;
  etapa: string | null;
  medicao_id: string | null;
  latitude: string | null;
  longitude: string | null;
  anexo_id: string | null;
  registrado_por_id: string | null;
  created_at: string;
}

export interface VistoriaObra {
  id: string;
  obra_id: string;
  data: string | null;
  tipo: string | null;
  vistoriador: string | null;
  orgao_vistoriador: string | null;
  status: string | null;
  protocolo: string | null;
  observacoes: string | null;
  nao_conformidades: string | null;
  recomendacoes: string | null;
  registrado_por_id: string | null;
  created_at: string;
}

export const VISTORIA_TIPOS: Record<string, string> = {
  ROTINEIRA: "Rotineira",
  FISCALIZACAO: "Fiscalização",
  RECEBIMENTO: "Recebimento",
  ESPECIAL: "Especial",
  OUTRA: "Outra",
};

export const VISTORIA_STATUS: Record<string, string> = {
  AGENDADA: "Agendada",
  EM_ANDAMENTO: "Em andamento",
  REALIZADA: "Realizada",
  APROVADA: "Aprovada",
  COM_RESSALVA: "Com ressalva",
  REPROVADA: "Reprovada",
  CANCELADA: "Cancelada",
};

export const DIARIO_TIPOS = ["VISITA", "OCORRENCIA", "CHUVA", "PARALISACAO", "AVANCO", "PROBLEMA_TECNICO", "DETERMINACAO", "FISCALIZACAO", "REUNIAO", "NOTIFICACAO"];

// ── Fluxo de trabalho: o que o assessor coordena e o que o departamento recebe ──

export type DemandaItem = {
  id: string;
  titulo: string;
  convenio_id: string;
  processo: string | null;
  setor: string | null;
  setor_id: string | null;
  responsavel: string | null;
  status: string;
  prioridade: string;
  prazo: string | null;
  prazo_interno: string | null;
  atrasada: boolean;
  dias_parada: number | null;
};

export type SetorResumo = {
  setor_id: string | null;
  setor: string;
  total: number;
  atrasadas: number;
  demandas: DemandaItem[];
};

export type ProcessoPendente = {
  id: string;
  titulo: string;
  situacao: string | null;
  etapa_atual: string | null;
  dias_parado: number | null;
};

export type MesaDoAssessor = {
  para_analisar: DemandaItem[];
  contestacoes: DemandaItem[];
  devolvidas: DemandaItem[];
  nos_setores: SetorResumo[];
  para_protocolar: ProcessoPendente[];
  aguardando_governo: ProcessoPendente[];
  prazos_criticos: DemandaItem[];
  sem_movimentacao: ProcessoPendente[];
};

export type CaixaDoDepartamento = {
  novas: DemandaItem[];
  em_andamento: DemandaItem[];
  devolvidas: DemandaItem[];
  aguardando_analise: DemandaItem[];
};

// ── Núcleo v2: relacionamento, controle e navegação ───────
// Espelham os schemas da API. O frontend não decide autorização: quando o
// usuário não tem `financial.view`, `financeiro` chega vazio do servidor.

export type StatusProtocolo =
  | "PROTOCOLADO" | "EM_ANALISE" | "EM_DILIGENCIA"
  | "DOCUMENTACAO_COMPLEMENTAR" | "APROVADO" | "REJEITADO" | "ARQUIVADO";

export interface ProtocoloAtualizacao {
  id: string;
  situacao: StatusProtocolo;
  descricao: string;
  ocorrido_em: string;
  registrado_por_id: string | null;
}

export interface Protocolo {
  id: string;
  demanda_id: string;
  sistema: string;
  numero: string;
  ano: number | null;
  orgao: string | null;
  data_protocolo: string;
  url: string | null;
  situacao: StatusProtocolo;
  observacoes: string | null;
  prazo_resposta: string | null;
  proxima_verificacao: string | null;
  responsavel_id: string | null;
  atualizacoes: ProtocoloAtualizacao[];
}

export interface AgendaProtocolos {
  total_abertos: number;
  cobrar_hoje: { id: string; demanda_id: string; sistema: string; numero: string; orgao: string | null; situacao: string; proxima_verificacao: string | null }[];
  prazo_de_resposta_vencido: { id: string; demanda_id: string; sistema: string; numero: string; prazo_resposta: string | null }[];
  sem_acompanhamento_agendado: { id: string; demanda_id: string; numero: string }[];
}

export interface ComentarioDemanda {
  id: string;
  demanda_id: string;
  tarefa_id: string | null;
  responde_a_id: string | null;
  autor_id: string;
  autor_nome: string | null;
  texto: string;
  fixado: boolean;
  editado_em: string | null;
  created_at: string;
  mencoes: { user_id: string; lido_em: string | null }[];
}

export interface Mencao {
  mencao_id: string;
  comentario_id: string;
  demanda_id: string;
  tarefa_id: string | null;
  texto: string;
  criado_em: string;
  lido_em: string | null;
}

export interface ChecklistItem {
  id: string;
  descricao: string;
  ordem: number;
  obrigatorio: boolean;
  exige_documento: boolean;
  documento_id: string | null;
  observacao: string | null;
  concluido_em: string | null;
  concluido_por_id: string | null;
}

export interface Checklist {
  id: string;
  demanda_id: string;
  etapa_id: string | null;
  titulo: string;
  descricao: string | null;
  obrigatorio: boolean;
  total: number;
  concluidos: number;
  itens: ChecklistItem[];
}

export type TipoRegistroFinanceiro =
  | "PREVISAO" | "APROVACAO" | "CONTRAPARTIDA" | "LICITADO" | "CONTRATADO"
  | "EMPENHO" | "LIQUIDACAO" | "PAGAMENTO" | "NOTA_FISCAL"
  | "REPASSE_RECEBIDO" | "DEVOLUCAO" | "OUTRO";

export interface RegistroFinanceiro {
  id: string;
  demanda_id: string;
  tipo: TipoRegistroFinanceiro;
  valor: string;
  data_registro: string;
  numero_documento: string | null;
  fonte_recurso: string | null;
  favorecido: string | null;
  descricao: string | null;
  documento_id: string | null;
  registrado_por_id: string;
}

export interface FinanceiroDemanda {
  demanda_id: string;
  numero: string;
  fonte_recurso: string | null;
  esfera: string | null;
  orgao_concedente: string | null;
  // Derivados dos lançamentos: `null` significa "sem lançamento", não zero.
  valor_previsto: number | null;
  valor_aprovado: number | null;
  valor_contrapartida: number | null;
  valor_licitado: number | null;
  valor_contratado: number | null;
  valor_empenhado: number | null;
  valor_liquidado: number | null;
  valor_pago: number | null;
  valor_executado: number | null;
  saldo: number;
  por_tipo: Record<string, number>;
  registros: RegistroFinanceiro[];
}

export interface Autoridade {
  id: string;
  nome: string;
  tipo: string;
  cargo: string | null;
  instituicao: string | null;
  partido: string | null;
  esfera: string | null;
  telefone: string | null;
  email: string | null;
  assessor_nome: string | null;
  assessor_telefone: string | null;
  observacoes: string | null;
  ativo: boolean;
  contatos: { id: string; nome: string; funcao: string | null; telefone: string | null; email: string | null }[];
}

export interface HistoricoAutoridade {
  autoridade: { id: string; nome: string; cargo: string | null; instituicao: string | null; esfera: string | null };
  total_demandas: number;
  em_andamento: number;
  concluidas: number;
  valor_indicado: number;
  valor_aprovado: number;
  valor_contratado: number;
  valor_executado: number;
  valor_pago: number;
  demandas: { id: string; numero: string; titulo: string; situacao: string | null; concluida_em: string | null; valor_aprovado: number }[];
}

export interface BuscaGlobal {
  termo: string;
  demandas: { id: string; numero: string; titulo: string; status: string | null; prioridade: string; prazo_final: string | null; atrasada: boolean }[];
  tarefas: { id: string; demanda_id: string | null; titulo: string; status: string }[];
  protocolos: { id: string; demanda_id: string; sistema: string; numero: string; situacao: string }[];
  autoridades: { id: string; nome: string; cargo: string | null; instituicao: string | null }[];
  comentarios: { id: string; demanda_id: string; trecho: string; criado_em: string }[];
}

export interface VisaoSalva {
  id: string;
  nome: string;
  descricao: string | null;
  recurso: string;
  filtros: Record<string, unknown>;
  layout: string;
  compartilhada: boolean;
  padrao: boolean;
  user_id: string;
  minha: boolean;
}

export interface RelatorioDemanda {
  demanda: Record<string, unknown> & { numero: string; titulo: string };
  resumo_executivo: string;
  participantes: { papel: string; nome: string | null; setor: string | null }[];
  financeiro: Record<string, string | null>;
  tarefas: { titulo: string; responsavel: string | null; status: string; prazo: string }[];
  tarefas_abertas: number;
  checklists: { titulo: string; total: number; concluidos: number; itens: { descricao: string; concluido_em: string | null; concluido_por: string | null }[] }[];
  documentos: { nome: string; versao: number; pasta: string | null; enviado_em: string; hash: string | null }[];
  protocolos: { sistema: string; numero: string; orgao: string | null; data: string; situacao: string }[];
  timeline: { quando: string; ator: string | null; descricao: string }[];
}

// ── Gestão avançada (v3) ────────────────────────────────────────────────────

export interface DemandaResumo {
  id: string;
  numero: string;
  titulo: string;
  progresso: number;
  concluida_em?: string | null;
}

export interface Marco {
  id: string;
  titulo: string;
  descricao?: string | null;
  ordem: number;
  status: "PENDENTE" | "EM_ANDAMENTO" | "CONCLUIDO" | "CANCELADO";
  data_prevista?: string | null;
  data_realizada?: string | null;
  responsavel_id?: string | null;
  atrasado: boolean;
  created_at: string;
}

export interface Risco {
  id: string;
  descricao: string;
  categoria?: string | null;
  probabilidade: number;
  impacto: number;
  score: number;
  nivel: "BAIXO" | "MEDIO" | "ALTO" | "CRITICO";
  mitigacao?: string | null;
  status: "IDENTIFICADO" | "EM_MITIGACAO" | "MITIGADO" | "MATERIALIZADO" | "ENCERRADO";
  previsao?: string | null;
  resolvido_em?: string | null;
  responsavel_id?: string | null;
  created_at: string;
}

export interface Relacionamento {
  id: string;
  tipo: "RELACIONADA" | "DEPENDENTE" | "DUPLICADA";
  descricao?: string | null;
  relacionada: DemandaResumo;
  created_at: string;
}

export interface HierarquiaDemanda {
  pai?: DemandaResumo | null;
  filhas: DemandaResumo[];
  relacionamentos: Relacionamento[];
  tem_filhas: boolean;
  total_filhas: number;
  filhas_concluidas: number;
  progresso_filhas?: number | null;
  progresso_agregado: number;
}

export interface CampoCustomizado {
  id: string;
  chave: string;
  rotulo: string;
  tipo: "TEXTO" | "TEXTO_LONGO" | "NUMERO" | "MOEDA" | "DATA" | "SELECAO" | "MULTIPLA_ESCOLHA" | "BOOLEANO" | "USUARIO" | "DEPARTAMENTO" | "URL";
  tipo_demanda_id?: string | null;
  obrigatorio: boolean;
  ativo: boolean;
  ordem: number;
  ajuda?: string | null;
  opcoes?: unknown[] | null;
  validacao?: Record<string, unknown> | null;
}

export interface CampoCustomizadoComValor extends CampoCustomizado {
  valor?: unknown;
}

export interface SlaConfig {
  id: string;
  tipo_demanda_id?: string | null;
  setor_id?: string | null;
  prioridade?: string | null;
  valor: number;
  contagem: "HORAS" | "DIAS_CORRIDOS" | "DIAS_UTEIS";
  descricao?: string | null;
  ativo: boolean;
}

export interface SlaPainel {
  resumo: Record<string, number>;
  por_setor: Record<string, Record<string, number>>;
  vencidas: {
    demanda_id: string;
    numero: string;
    titulo: string;
    setor: string;
    vencimento: string;
    horas_restantes: number;
  }[];
}

export interface Webhook {
  id: string;
  url: string;
  descricao?: string | null;
  eventos?: string[] | null;
  ativo: boolean;
  ultima_entrega_em?: string | null;
  ultimo_status?: string | null;
  created_at: string;
  secret?: string;
}
