export type FamilyOut = {
  id: string; codigo: number; responsavel_id: string; responsavel_nome: string;
  nis_responsavel_mascarado: string; cep: string; logradouro: string; numero: string;
  complemento: string | null; bairro: string; municipio: string; uf: string;
  ponto_referencia: string | null; telefone_contato: string | null;
  situacao_rua: boolean; data_cadastramento: string;
  despesa_aluguel: number | null; despesa_transporte: number | null;
  despesa_alimentacao: number | null; despesa_medicamentos: number | null;
  despesa_outros: number | null; latitude: number | null; longitude: number | null;
  geocode_status: string; territorio: string; faixa_renda: string;
  no_cadunico: boolean; cadunico_atualizado_em: string;
  beneficiaria_pbf: boolean; possui_bpc: boolean; inseguranca_alimentar: boolean;
  membros: MemberOut[];
  created_at: string; updated_at: string;
};
export type MemberOut = {
  membership_id: string; person_id: string; nome_exibicao: string;
  nome_civil?: string; parentesco: string; is_responsavel: boolean;
  status: string; data_entrada: string; data_saida: string | null;
  cpf_mascarado?: string; nis_mascarado?: string; data_nascimento?: string;
  sexo?: string; tipo_deficiencia?: string | null;
  frequenta_escola?: boolean | null; is_falecido?: boolean;
  family_id?: string; familia_codigo?: number; familia_nome?: string;
  bairro?: string; unidade?: string; membro_pbf?: boolean;
  beneficiario_bpc?: boolean; cpf_irregular?: boolean;
};
