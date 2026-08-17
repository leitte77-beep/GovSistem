// Tipos compartilhados entre páginas — espelham os schemas Pydantic da API.

export interface Pagina<T> {
  itens: T[];
  total: number;
  pagina: number;
  por_pagina: number;
  paginas: number;
}

export interface UsuarioAtual {
  id: string;
  nome: string;
  email: string;
  perfil: string;
  setor_id: string | null;
  organizacao_id: string;
  permissoes: string[];
}

export type StatusSLA = "dentro_do_prazo" | "atencao" | "atrasado" | "critico";

export interface ProcessoResumo {
  id: string;
  numero_processo: string;
  exercicio: number;
  tipo_processo: string;
  status_geral: string;
  secretaria_id: string;
  secretaria_nome: string | null;
  objeto: string;
  valor_estimado: number | null;
  etapa_atual_nome: string | null;
  etapa_atual_codigo: string | null;
  responsavel_setor: string | null;
  responsavel_usuario: string | null;
  dias_na_etapa: number | null;
  status_sla: StatusSLA | null;
  favorito: boolean;
  created_at: string;
}

export interface Pendencia {
  id: string;
  descricao: string;
  obrigatorio: boolean;
  satisfeito: boolean;
}

export interface ProcessoDetalhe extends ProcessoResumo {
  solicitacao_id: string | null;
  processo_origem_id: string | null;
  origem_contrato_id: string | null;
  template_id: string;
  proxima_etapa_nome: string | null;
  pendencias: Pendencia[];
}

export interface HistoricoEtapa {
  id: string;
  etapa_id: string;
  etapa_nome: string;
  ordem_execucao: number;
  responsavel_setor: string | null;
  responsavel_usuario: string | null;
  iniciada_em: string;
  encerrada_em: string | null;
  resultado: string;
  justificativa: string | null;
  dias_na_etapa: number | null;
}

export interface Secretaria {
  id: string;
  nome: string;
  sigla: string;
  ativa: boolean;
}

export interface Setor {
  id: string;
  secretaria_id: string;
  nome: string;
  sigla: string;
  papel_funcional: string | null;
  ativo: boolean;
}

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  perfil: string;
  setor_id: string | null;
  cargo: string | null;
  ativo: boolean;
}

export interface DashboardIndicadores {
  processos_em_andamento: number;
  processos_atrasados: number;
  por_etapa: Record<string, number>;
  valor_em_contratacao: number;
  contratos_ativos: number;
  valor_contratado: number;
  contratos_vencendo: number;
  atas_vencendo: number;
}

export interface Notificacao {
  id: string;
  tipo: string;
  titulo: string;
  mensagem: string;
  entidade_tipo: string | null;
  entidade_id: string | null;
  link: string | null;
  situacao: "nao_lida" | "lida";
  created_at: string;
}

export const ROTULOS_TIPO_PROCESSO: Record<string, string> = {
  pregao: "Pregão",
  concorrencia: "Concorrência",
  dispensa: "Dispensa",
  inexigibilidade: "Inexigibilidade",
  credenciamento: "Credenciamento",
  adesao_ata: "Adesão à Ata",
  contratacao_emergencial: "Contratação Emergencial",
};

export const ROTULOS_SLA: Record<StatusSLA, string> = {
  dentro_do_prazo: "Dentro do prazo",
  atencao: "Atenção",
  atrasado: "Atrasado",
  critico: "Crítico",
};
