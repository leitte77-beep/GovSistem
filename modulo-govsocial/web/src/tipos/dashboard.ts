/**
 * DTOs do Dashboard/Vigilância (§4.9) espelhando app/schemas/dashboard.py.
 */

export type DashboardOverviewOut = {
  atendimentos_mes: number;
  acompanhamentos_ativos: number;
  familias_cadastradas: number;
  beneficios_concedidos_mes: number;
  encaminhamentos_pendentes: number;
  grupos_ativos: number;
  inscritos_scfv: number;
};

export type TimeSeriesItem = {
  ano: number;
  mes: number;
  atendimentos: number;
  beneficios: number;
};

export type TerritoryItem = {
  territorio: string;
  total_familias: number;
};

export type MapItem = {
  territorio: string;
  bairro: string;
  total_familias: number;
  centroide_lat: number | null;
  centroide_lng: number | null;
};

export type BenefitReportItem = {
  tipo_beneficio: string;
  total_concessoes: number;
  valor_total: number;
};

export type FaixaRendaItem = {
  faixa: string;
  total: number;
};

export type IndicatorsOut = {
  total_familias: number;
  pbf: number;
  pbf_percentual: number;
  bpc: number;
  bpc_percentual: number;
  cadunico_desatualizado_24m: number;
  inseguranca_alimentar: number;
  renda_por_faixa: FaixaRendaItem[];
};

export type DashboardActivityItem = {
  id: string;
  texto: string;
  descricao: string;
  categoria: string;
  entidade: string;
  data: string;
  acao: string;
  ator?: string | null;
};
