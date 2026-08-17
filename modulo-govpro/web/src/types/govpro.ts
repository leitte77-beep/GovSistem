export type NivelAcesso = "PUBLICO" | "RESTRITO" | "SIGILOSO";
export type SituacaoProcesso = "EM_TRAMITACAO" | "SOBRESTADO" | "ENCERRADO" | "ARQUIVADO";
export type SituacaoDocumento = "RASCUNHO" | "ASSINADO" | "PUBLICADO" | "DESENTRANHADO";

export interface InteressadoOut {
  id: string;
  tipo_pessoa: string;
  nome: string;
  cpf_cnpj?: string | null;
  email?: string | null;
}

export interface ProcessoOut {
  id: string;
  nup: string;
  numero_antigo?: string | null;
  tipo_processo_id: string;
  especificacao: string;
  nivel_acesso: NivelAcesso;
  hipotese_legal_id?: string | null;
  situacao: SituacaoProcesso;
  unidade_protocolizadora_id?: string | null;
  responsavel_id?: string | null;
  data_autuacao?: string | null;
  created_at: string;
}

export interface TramitacaoCaixaOut {
  id: string;
  processo_id: string;
  nup: string;
  especificacao: string;
  unidade_origem_id?: string | null;
  unidade_destino_id: string;
  tipo: string;
  prazo_dias?: number | null;
  recebida: boolean;
  created_at: string;
}

export type CaixaAba =
  | "recebidos"
  | "atribuidos"
  | "nao-visualizados"
  | "aguardando-acao"
  | "aguardando-retorno"
  | "enviados"
  | "concluidos";

export interface DocumentoOut {
  id: string;
  processo_id: string;
  tipo_documento_id?: string | null;
  numero?: string | null;
  titulo: string;
  formato: string;
  nivel_acesso: NivelAcesso;
  situacao: SituacaoDocumento;
  versao_atual: number;
  codigo_verificador?: string | null;
  hash_conteudo?: string | null;
  assinado_em?: string | null;
  created_at: string;
}

export interface TramitacaoOut {
  id: string;
  processo_id: string;
  unidade_origem_id?: string | null;
  unidade_destino_id: string;
  tipo: string;
  prazo_dias?: number | null;
  observacao?: string | null;
  recebida: boolean;
  recebida_em?: string | null;
  created_at: string;
}

export interface AndamentoOut {
  id: string;
  tipo_evento: string;
  descricao: string;
  unidade_id?: string | null;
  usuario_id?: string | null;
  created_at: string;
}

export interface AssinaturaOut {
  id: string;
  documento_id: string;
  signatario_nome: string;
  papel_cargo?: string | null;
  nivel: string;
  hash_assinado: string;
  created_at: string;
}

// ── Catálogos ────────────────────────────────────────────────────────────────
export interface TipoProcesso {
  id: string;
  codigo: string;
  nome: string;
  descricao?: string | null;
  publico_externo: boolean;
  niveis_permitidos: NivelAcesso[];
  prazo_legal_dias?: number | null;
  base_legal?: string | null;
  unidade_destino_padrao_id?: string | null;
  ativo?: boolean;
}

export interface TipoProcessoInput {
  codigo: string;
  nome: string;
  descricao?: string | null;
  publico_externo?: boolean;
  niveis_permitidos?: NivelAcesso[];
  prazo_legal_dias?: number | null;
  base_legal?: string | null;
  unidade_destino_padrao_id?: string | null;
}

export type TipoProcessoUpdate = Partial<TipoProcessoInput> & { ativo?: boolean };

export interface TipoDocumento {
  id: string;
  codigo: string;
  nome: string;
  nivel_assinatura_minimo: string;
  numeracao: boolean;
  perfis_autorizados?: string[] | null;
  qtd_assinaturas_minima?: number;
  assinatura_sequencial?: boolean;
  exige_assinatura_externa?: boolean;
  permite_bloco?: boolean;
  fundamento_normativo?: string | null;
  ativo?: boolean;
}

export interface TipoDocumentoInput {
  codigo: string;
  nome: string;
  nivel_assinatura_minimo?: string;
  numeracao?: boolean;
}

export type TipoDocumentoUpdate = Partial<TipoDocumentoInput> & { ativo?: boolean };

export interface MatrizAssinaturaUpdate {
  nivel_assinatura_minimo?: string;
  perfis_autorizados?: string[] | null;
  qtd_assinaturas_minima?: number;
  assinatura_sequencial?: boolean;
  exige_assinatura_externa?: boolean;
  permite_bloco?: boolean;
  fundamento_normativo?: string | null;
}

export interface Unidade {
  id: string;
  sigla: string;
  nome: string;
  unidade_pai_id?: string | null;
  email?: string | null;
  protocolizadora: boolean;
  codigo_protocolizadora?: string | null;
  ativa?: boolean;
}

export interface UnidadeInput {
  sigla: string;
  nome: string;
  unidade_pai_id?: string | null;
  email?: string | null;
  protocolizadora?: boolean;
  codigo_protocolizadora?: string | null;
}

export type UnidadeUpdate = Partial<UnidadeInput> & { ativa?: boolean };

export interface HipoteseLegal {
  id: string;
  codigo: string;
  descricao: string;
  base_legal?: string | null;
  grau_sigilo?: string | null;
  prazo_sigilo_anos?: number | null;
  ativo?: boolean;
}

export interface HipoteseLegalInput {
  codigo: string;
  descricao: string;
  base_legal?: string | null;
  grau_sigilo?: string | null;
  prazo_sigilo_anos?: number | null;
}

export type HipoteseLegalUpdate = Partial<Omit<HipoteseLegalInput, "codigo">> & { ativo?: boolean };

export interface PlanoClassificacao {
  id: string;
  codigo: string;
  descricao: string;
  classe_pai_id?: string | null;
  ativo?: boolean;
}

export interface PlanoClassificacaoInput {
  codigo: string;
  descricao: string;
  classe_pai_id?: string | null;
}

export type PlanoClassificacaoUpdate = Partial<Omit<PlanoClassificacaoInput, "codigo">> & {
  ativo?: boolean;
};

export interface MotivoSobrestamento {
  id: string;
  nome: string;
  descricao?: string | null;
  ativo?: boolean;
}

export interface MotivoSobrestamentoInput {
  nome: string;
  descricao?: string | null;
}

export type MotivoSobrestamentoUpdate = Partial<MotivoSobrestamentoInput> & { ativo?: boolean };

// ── Auditoria ────────────────────────────────────────────────────────────────
export interface AuditoriaEvento {
  id: string;
  occurred_at: string;
  actor_user_id?: string | null;
  actor_tipo: string;
  action: string;
  entity: string;
  entity_id?: string | null;
  processo_id?: string | null;
  nup?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  finalidade?: string | null;
  hash_registro: string;
}

export interface AuditoriaFiltro {
  entity?: string;
  entity_id?: string;
  processo_id?: string;
  actor_user_id?: string;
  action?: string;
  data_inicio?: string;
  data_fim?: string;
  skip?: number;
  limit?: number;
}

// ── Gestão / prazos ──────────────────────────────────────────────────────────
export interface PrazoItem {
  id: string;
  processo_id: string;
  tipo: string;
  titulo: string;
  data_vencimento: string;
  concluido?: boolean;
}

export interface Feriado {
  data: string;
  nome: string;
  escopo: string;
}

export interface CredencialAcessoOut {
  id: string;
  usuario_id: string;
  usuario_nome: string;
  usuario_email: string;
  motivo?: string | null;
  concedida_em: string;
}

export interface CicloArquivisticoOut {
  processo_id: string;
  fase: "CORRENTE" | "INTERMEDIARIA" | "PERMANENTE" | string;
  data_transferencia?: string | null;
  data_recolhimento?: string | null;
  destinacao_final?: string | null;
}

export interface IntimacaoOut {
  id: string;
  destinatario_nome: string;
  texto: string;
  prazo_dias: number;
  status: string;
  disponibilizada_em?: string | null;
  ciencia_em?: string | null;
}

export interface AcessoExternoOut {
  id: string;
  usuario_externo_id?: string | null;
  email_externo?: string | null;
  expira_em?: string | null;
  created_at: string;
}

export interface AcompanhamentoOut {
  id: string;
  processo_id: string;
  etiqueta?: string | null;
}

export interface BlocoAssinaturaOut {
  id: string;
  nome: string;
  created_at: string;
  total_documentos: number;
}

export interface BlocoAssinaturaDocumentoOut {
  id: string;
  titulo: string;
  situacao: string;
  processo_nup: string;
}

export interface BlocoAssinaturaDetalhe {
  id: string;
  nome: string;
  documentos: BlocoAssinaturaDocumentoOut[];
}

export interface CidadaoPendente {
  id: string;
  nome: string;
  cpf_cnpj?: string | null;
  email?: string | null;
}

export interface ManifestacaoOut {
  id: string;
  tipo: string;
  texto: string;
  anonima: boolean;
  status: string;
}

export interface Indisponibilidade {
  id: string;
  tipo: string;
  inicio: string;
  fim?: string | null;
  escopo?: string | null;
  causa: string;
  encerrada: boolean;
  certidao_emitida: boolean;
}

export interface IndisponibilidadeInput {
  inicio: string;
  causa: string;
  tipo?: string;
  fim?: string | null;
  escopo?: string | null;
}

export interface TtdItem {
  id: string;
  classe_id: string;
  classe: string;
  prazo_corrente_anos: number;
  prazo_intermediario_anos: number;
  destinacao_final: string;
}

// ── Payloads ─────────────────────────────────────────────────────────────────
export interface InteressadoInput {
  tipo_pessoa: string;
  nome: string;
  cpf_cnpj?: string | null;
  email?: string | null;
  telefone?: string | null;
}

export interface ProcessoAutuarInput {
  tipo_processo_id: string;
  especificacao: string;
  interessados: InteressadoInput[];
  nivel_acesso: NivelAcesso;
  hipotese_legal_id?: string | null;
  classe_id?: string | null;
  observacoes?: string | null;
  unidade_protocolizadora_id?: string | null;
}

export interface DocumentoCreate {
  titulo: string;
  conteudo_html?: string | null;
  tipo_documento_id?: string | null;
  nivel_acesso: NivelAcesso;
  hipotese_legal_id?: string | null;
  unidade_id?: string | null;
}

export interface TramitacaoDestino {
  unidade_id: string;
  prazo_dias?: number | null;
  observacao?: string | null;
}

export interface TramitacaoCreate {
  unidade_origem_id: string;
  destinos: TramitacaoDestino[];
}

export interface PrazoCreate {
  tipo: string;
  titulo: string;
  dias: number;
  modo: string;
  data_inicio?: string | null;
  unidade_id?: string | null;
}
