/** Domínios configuráveis por tenant — espelham app/schemas/schemas.py. */

export type ServiceTypeOut = {
  id: string;
  code: string;
  nome: string;
  source: string;
  vigencia_inicio: string;
  vigencia_fim: string | null;
  ativo: boolean;
  sigla: string | null;
  protecao: string | null;
};

export type ReferralCodeOut = {
  id: string;
  code: string;
  nome: string;
  area: string | null;
  ativo: boolean;
};

export type BenefitTypeOut = {
  id: string;
  code: string;
  nome: string;
  categoria: string | null;
  unidade_medida: string | null;
  exige_parecer: boolean;
  periodicidade_max_dias: number | null;
  ativo: boolean;
};
