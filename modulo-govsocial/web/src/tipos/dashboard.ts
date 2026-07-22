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
  // TODO(backend): preencher nos eventos de auditoria para permitir frases
  // completas ("consultou a família {nome}") sem depender de `descricao` livre.
  nome?: string | null;
  competencia?: string | null;
  ator?: string | null;
};

// ── KPICard ──────────────────────────────────────────────────────
export type KPIDelta = {
  direction: "up" | "down" | "flat";
  percent?: number;
  label: string;
};

export type KPICardProps = {
  label: string;
  value: number | string;
  hint?: string;
  delta?: KPIDelta;
  sparkline?: number[];
  accent?: boolean;
  to?: string;
  loading?: boolean;
  error?: boolean;
  /** KILL-SWITCH: quando false, NADA é renderizado no canto superior direito (sem traço, ícone, svg, nada). Padrão: true. */
  showDecoration?: boolean;
};

// ── Recomendações ─────────────────────────────────────────────────
export type RecommendationSeverity = "alerta" | "atencao" | "info";

export type Recommendation = {
  id: string;
  severity: RecommendationSeverity;
  title: string;
  detail?: string;
  ctaLabel: string;
  to: string;
  icon: string;
};

export type RecommendationScope = {
  rmaFechado: boolean;
  diasAteFimDoMes: number;
  mesAtual: string;
  nisPendentes: number;
  semAtendimento90d: number;
  agendamentosHoje: number;
  aniversariantesSemana: number;
  encaminhamentosPrazo: number;
};
