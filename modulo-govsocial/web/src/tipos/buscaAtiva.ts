export type PessoaAbordadaOut = {
  id: string;
  busca_ativa_id: string;
  nome: string | null;
  nome_social: string | null;
  idade_estimada: number | null;
  sexo: string | null;
  possui_documento: boolean;
  tempo_rua_estimado: string | null;
  aceitou_acolhimento: boolean;
  encaminhado_para: string | null;
  observacoes: string | null;
  created_at: string;
};

export type BuscaAtivaOut = {
  id: string;
  tenant_id: string;
  professional_id: string | null;
  data_acao: string;
  local_logradouro: string | null;
  local_bairro: string | null;
  local_referencia: string | null;
  latitude: number | null;
  longitude: number | null;
  equipe_nomes: string[] | null;
  pessoas_abordadas: number;
  pessoas_aceitaram_acolhimento: number;
  pessoas_encaminhadas: number;
  observacoes: string | null;
  fotos_urls: string[] | null;
  pessoas: PessoaAbordadaOut[] | null;
  created_at: string;
  updated_at: string;
};

export type BuscaAtivaResumo = {
  total_abordagens: number;
  total_aceitaram_acolhimento: number;
  total_encaminhados: number;
  total_pessoas_abordadas: number;
};

export type PessoaAbordadaCreate = {
  nome?: string | null;
  nome_social?: string | null;
  idade_estimada?: number | null;
  sexo?: string | null;
  possui_documento?: boolean;
  tempo_rua_estimado?: string | null;
  aceitou_acolhimento?: boolean;
  encaminhado_para?: string | null;
  observacoes?: string | null;
};

export type BuscaAtivaCreate = {
  professional_id?: string | null;
  data_acao: string;
  local_logradouro?: string | null;
  local_bairro?: string | null;
  local_referencia?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  equipe_nomes?: string[] | null;
  pessoas_abordadas?: number;
  pessoas_aceitaram_acolhimento?: number;
  pessoas_encaminhadas?: number;
  observacoes?: string | null;
  pessoas?: PessoaAbordadaCreate[] | null;
};
