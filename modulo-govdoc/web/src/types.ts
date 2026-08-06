export type Usuario = {
  id: string; nome: string; email: string; perfil: string; secretaria_id?: string;
  setor_id?: string; cargo?: string; ativo: boolean; ultimo_acesso?: string;
};

export type Sessao = {
  usuario: Usuario;
  instituicao: { id: string; nome: string; cor_primaria: string; cor_destaque: string };
  permissoes_globais: string[];
};

export type Pagina<T> = { itens: T[]; total: number; pagina: number; por_pagina: number; paginas: number };

export type Pasta = {
  id: string; nome: string; descricao?: string; pasta_superior_id?: string; secretaria_id?: string;
  secretaria_nome?: string; setor_id?: string; setor_nome?: string; responsavel_nome?: string;
  cor: string; icone: string; classificacao: string; permitir_compartilhamento_externo: boolean;
  herdar_permissoes: boolean; vencimento?: string; profundidade: number; total_subpastas: number;
  total_documentos: number; tamanho_bytes: number; favorito: boolean; permissoes: string[];
  criado_em: string; atualizado_em: string;
};

export type Documento = {
  id: string; codigo: string; nome_exibicao: string; nome_original: string; descricao?: string;
  assunto?: string; pasta_id: string; pasta_nome?: string; secretaria_nome?: string; setor_nome?: string;
  categoria_id?: string; categoria_nome?: string; numero_processo?: string; numero_protocolo?: string;
  ano_referencia?: number; data_documento?: string; data_validade?: string; responsavel_nome?: string;
  autor?: string; interessado?: string; classificacao: string; situacao: string; versao_atual: number;
  tamanho_bytes: number; mime?: string; extensao?: string; sha256?: string; situacao_arquivo: string;
  situacao_indexacao: string; bloqueio_legal: boolean; versao_controle: number; atalho: boolean;
  total_visualizacoes: number; total_downloads: number; favorito: boolean; etiquetas: string[];
  campos_personalizados: Record<string, unknown>; permissoes: string[]; criado_em: string; atualizado_em: string;
  excluido_em?: string; excluido_por_nome?: string; motivo_exclusao?: string;
};

export type Categoria = { id: string; nome: string; slug: string; descricao?: string; cor: string; icone: string; ativo: boolean; total_documentos: number; campos: any[] };
export type Secretaria = { id: string; nome: string; sigla: string; descricao?: string; responsavel?: string; cor: string; icone: string; ativo: boolean; total_setores: number; total_documentos: number; total_usuarios?: number; consumo_bytes?: number; ultima_sincronizacao?: string };
export type Setor = { id: string; nome: string; sigla?: string; secretaria_id: string; secretaria_nome?: string; responsavel?: string; descricao?: string; ativo: boolean; total_documentos?: number; total_usuarios?: number; consumo_bytes?: number };

export type Painel = {
  totais: Record<string, number>;
  armazenamento: Record<string, any>;
  backups: { concluidos: number; falhas: number; ultimo?: any };
  documentos_recentes: Array<{ id: string; nome: string; codigo: string; extensao?: string; atualizado_em: string }>;
  mais_acessados: Array<{ id: string; nome: string; acessos: number }>;
  atividades: Array<{ acao: string; usuario?: string; recurso?: string; quando: string; resultado: string }>;
};

