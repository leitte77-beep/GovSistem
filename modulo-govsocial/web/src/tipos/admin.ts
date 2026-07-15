/**
 * DTOs da Administração do tenant (§4.10) espelhando os schemas do backend
 * (onboarding.py, importacao.py).
 */

export type TenantWizardStep = {
  step: string;
  completed: boolean;
};

export type TenantOnboardingStatus = {
  tenant_id: string;
  tenant_name: string;
  steps: TenantWizardStep[];
  ready: boolean;
};

export type WizardStepResult = {
  step: string;
  created?: number;
  added?: string | null;
  seeded?: unknown;
  redirect?: string;
  status?: string;
};

export type ImportJobOut = {
  id: string;
  tipo: string;
  status: string;
  nome_arquivo: string;
  total_linhas: number | null;
  linhas_processadas: number | null;
  novos: number | null;
  atualizados: number | null;
  conflitos: number | null;
  erros: number | null;
  criado_por_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ImportLogItem = {
  id: string;
  linha: number;
  status: string;
  nis: string | null;
  cpf: string | null;
  nome: string | null;
  mensagem: string | null;
  family_id_match: string | null;
  created_at: string;
};

export type ImportResultOut = {
  job: ImportJobOut;
  summary: Record<string, number>;
  logs: ImportLogItem[];
};

export type SystemHealthOut = {
  status: string;
  version: string;
  tenants_ativos: number;
  total_familias: number;
  total_atendimentos_mes: number;
  ultimo_rma_fechado: string | null;
};

// Payloads das etapas do wizard.
export type UnidadeWizard = {
  tipo: string;
  nome: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  territorios?: string[];
};

export type ProfissionalWizard = {
  nome: string;
  cpf?: string;
  funcao?: string;
  email?: string;
  telefone?: string;
};

export type OrganizationConfig = {
  nome_municipio: string;
  brasao_url: string | null;
  cor_destaque: string | null;
};
