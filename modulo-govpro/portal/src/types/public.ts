export interface OrgPublico {
  slug: string;
  nome: string;
}

export interface TipoProcessoPublico {
  id: string;
  codigo: string;
  nome: string;
  descricao?: string | null;
  prazo_legal_dias?: number | null;
}

export interface ValidacaoResultado {
  valido: boolean;
  codigo_verificador: string;
  nivel_acesso?: string;
  titulo?: string;
  hash?: string;
  assinado_em?: string | null;
  motivo?: string;
}

export interface ConsultaResultado {
  nup: string;
  encontrado: boolean;
  publico?: boolean;
  especificacao?: string;
  situacao?: string;
  data_autuacao?: string | null;
  mensagem?: string;
}

export interface CitizenMe {
  id: string;
  nome: string;
  email: string;
  aprovado: boolean;
}

export interface MeuProcesso {
  id: string;
  tipo: string;
  especificacao: string;
  nup: string | null;
  status: string;
  concluido_em: string | null;
}

export interface MinhaIntimacao {
  id: string;
  texto: string;
  prazo_dias: number;
  status: string;
  disponibilizada_em: string | null;
}

export interface ReciboPeticionamento {
  nup: string;
  recibo: string;
  horario_conclusao: string;
  peticionamento_id: string;
}

export interface ManifestacaoInput {
  org_slug: string;
  tipo: string;
  texto: string;
  anonima: boolean;
}
