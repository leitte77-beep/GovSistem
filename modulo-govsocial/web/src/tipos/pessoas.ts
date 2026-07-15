/**
 * DTOs de pessoas e famílias — espelham os schemas Pydantic do backend
 * (app/schemas/people.py). CPF/NIS chegam MASCARADOS em listagens/busca.
 */

export type PessoaBuscaItem = {
  person_id: string;
  nome_exibicao: string;
  nome_civil: string;
  family_id: string;
  codigo_familia: number;
  responsavel_nome: string | null;
  bairro: string | null;
};

export type UnifiedSearchItem = {
  person_id: string;
  nome_exibicao: string;
  cpf_mascarado: string | null;
  nis_mascarado: string | null;
  data_nascimento: string | null;
  familias: FamiliaResumoBusca[];
};

export type FamiliaResumoBusca = {
  family_id: string;
  codigo: number;
  parentesco?: string | null;
  territorio?: string | null;
};

export type PersonListItem = {
  id: string;
  nome_exibicao: string;
  nome_civil: string;
  cpf_mascarado: string | null;
  nis_mascarado: string | null;
  data_nascimento: string | null;
  is_falecido: boolean;
};

export type PersonOut = {
  id: string;
  nome_civil: string;
  nome_social: string | null;
  nome_exibicao: string;
  cpf_mascarado: string | null;
  nis_mascarado: string | null;
  data_nascimento: string | null;
  sexo: string | null;
  escolaridade: string | null;
  ocupacao: string | null;
  tipo_deficiencia: string | null;
  deficiencia_detalhe: string | null;
  raca_cor: string | null;
  estado_civil: string | null;
  frequenta_escola: boolean | null;
  situacao_mercado_trabalho: string | null;
  gestante: boolean | null;
  amamentando: boolean | null;
  renda_mensal: number | null;
  documentos: Record<string, unknown> | null;
  is_falecido: boolean;
  created_at: string;
  updated_at: string;
};

export type DuplicateCandidate = {
  id: string;
  nome_exibicao: string;
  cpf_mascarado: string | null;
  data_nascimento: string | null;
};

export type PersonCreateResult = {
  created: boolean;
  person: PersonOut | null;
  duplicates: DuplicateCandidate[];
};

export type PersonCreate = {
  nome_civil: string;
  nome_social?: string | null;
  cpf?: string | null;
  nis?: string | null;
  data_nascimento?: string | null;
  sexo?: string | null;
  escolaridade?: string | null;
  ocupacao?: string | null;
  tipo_deficiencia?: string | null;
  deficiencia_detalhe?: string | null;
  raca_cor?: string | null;
  estado_civil?: string | null;
  frequenta_escola?: boolean | null;
  situacao_mercado_trabalho?: string | null;
  gestante?: boolean | null;
  amamentando?: boolean | null;
  renda_mensal?: number | null;
  family_id?: string | null;
  parentesco?: string | null;
  confirmar_duplicata?: boolean;
};

export type PersonUpdate = {
  nome_civil?: string | null;
  nome_social?: string | null;
  cpf?: string | null;
  nis?: string | null;
  data_nascimento?: string | null;
  sexo?: string | null;
  escolaridade?: string | null;
  ocupacao?: string | null;
  tipo_deficiencia?: string | null;
  deficiencia_detalhe?: string | null;
  raca_cor?: string | null;
  estado_civil?: string | null;
  frequenta_escola?: boolean | null;
  situacao_mercado_trabalho?: string | null;
  gestante?: boolean | null;
  amamentando?: boolean | null;
  renda_mensal?: number | null;
  documentos?: Record<string, unknown> | null;
  is_falecido?: boolean | null;
};

// ── Famílias ─────────────────────────────────────────────────────

export type FamilyUpdate = {
  responsavel_id?: string | null;
  nis_responsavel?: string | null;
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  municipio?: string | null;
  uf?: string | null;
  ponto_referencia?: string | null;
  telefone_contato?: string | null;
  situacao_rua?: boolean | null;
  data_cadastramento?: string | null;
  despesa_aluguel?: number | null;
  despesa_transporte?: number | null;
  despesa_alimentacao?: number | null;
  despesa_medicamentos?: number | null;
  despesa_outros?: number | null;
  faixa_renda?: string | null;
  no_cadunico?: boolean | null;
  cadunico_atualizado_em?: string | null;
  beneficiaria_pbf?: boolean | null;
  possui_bpc?: boolean | null;
  inseguranca_alimentar?: boolean | null;
};
export type MemberOut = {
  membership_id: string;
  person_id: string;
  nome_exibicao: string;
  parentesco: string | null;
  status: string;
  data_entrada: string;
  data_saida: string | null;
  is_responsavel: boolean;
};

export type FamilyListItem = {
  id: string;
  codigo: number;
  responsavel_nome: string | null;
  nis_responsavel_mascarado: string | null;
  bairro: string | null;
  territorio: string | null;
  faixa_renda: string | null;
  beneficiaria_pbf: boolean;
  created_at: string;
};

export type FamilyOut = {
  id: string;
  codigo: number;
  responsavel_id: string | null;
  responsavel_nome: string | null;
  nis_responsavel_mascarado: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  municipio: string | null;
  uf: string | null;
  ponto_referencia: string | null;
  telefone_contato: string | null;
  situacao_rua: boolean;
  data_cadastramento: string | null;
  despesa_aluguel: number | null;
  despesa_transporte: number | null;
  despesa_alimentacao: number | null;
  despesa_medicamentos: number | null;
  despesa_outros: number | null;
  latitude: number | null;
  longitude: number | null;
  geocode_status: string;
  territorio: string | null;
  faixa_renda: string | null;
  no_cadunico: boolean;
  cadunico_atualizado_em: string | null;
  beneficiaria_pbf: boolean;
  possui_bpc: boolean;
  inseguranca_alimentar: boolean;
  membros: MemberOut[];
  created_at: string;
  updated_at: string;
};

export type FamilyCreate = {
  nis_responsavel?: string | null;
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  municipio?: string | null;
  uf?: string | null;
  ponto_referencia?: string | null;
  telefone_contato?: string | null;
  situacao_rua?: boolean;
  data_cadastramento?: string | null;
  despesa_aluguel?: number | null;
  despesa_transporte?: number | null;
  despesa_alimentacao?: number | null;
  despesa_medicamentos?: number | null;
  despesa_outros?: number | null;
  faixa_renda?: string | null;
  no_cadunico?: boolean;
  cadunico_atualizado_em?: string | null;
  beneficiaria_pbf?: boolean;
  possui_bpc?: boolean;
  inseguranca_alimentar?: boolean;
};
