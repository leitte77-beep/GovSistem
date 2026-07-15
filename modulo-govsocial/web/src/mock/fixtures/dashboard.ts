import type {
  BenefitReportItem,
  DashboardOverviewOut,
  IndicatorsOut,
  MapItem,
  TerritoryItem,
  TimeSeriesItem,
} from "@/tipos/dashboard";

/**
 * Fixtures do dashboard/vigilância (Fase 8, §4.9) — tenant "Nova Esperança".
 * Todos os números são AGREGADOS (sem PII). Os centroides alimentam o mapa SVG.
 */

export const DASHBOARD_OVERVIEW: DashboardOverviewOut = {
  atendimentos_mes: 342,
  acompanhamentos_ativos: 128,
  familias_cadastradas: 1876,
  beneficios_concedidos_mes: 97,
  encaminhamentos_pendentes: 11,
  grupos_ativos: 8,
  inscritos_scfv: 214,
};

/** Série de 12 meses (jul/2025 → jun/2026), plausível e determinística. */
export const DASHBOARD_SERIE: TimeSeriesItem[] = (() => {
  const meses: { ano: number; mes: number }[] = [];
  let ano = 2025;
  let mes = 7;
  for (let i = 0; i < 12; i++) {
    meses.push({ ano, mes });
    mes += 1;
    if (mes > 12) {
      mes = 1;
      ano += 1;
    }
  }
  return meses.map(({ ano: a, mes: m }, i) => ({
    ano: a,
    mes: m,
    atendimentos: 240 + ((m * 13) % 90) + i * 4,
    beneficios: 60 + ((m * 7) % 40) + (i % 3) * 3,
  }));
})();

export const DASHBOARD_TERRITORIOS: TerritoryItem[] = [
  { territorio: "Território Vila Rica", total_familias: 612 },
  { territorio: "Território Centro", total_familias: 418 },
  { territorio: "Território Beira-Rio", total_familias: 503 },
  { territorio: "Território Alto da Serra", total_familias: 343 },
];

export const DASHBOARD_MAPA: MapItem[] = [
  {
    territorio: "Território Vila Rica",
    bairro: "Vila Rica",
    total_familias: 612,
    centroide_lat: -7.09,
    centroide_lng: -34.9,
  },
  {
    territorio: "Território Centro",
    bairro: "Centro",
    total_familias: 418,
    centroide_lat: -7.11,
    centroide_lng: -34.86,
  },
  {
    territorio: "Território Beira-Rio",
    bairro: "Beira-Rio",
    total_familias: 503,
    centroide_lat: -7.13,
    centroide_lng: -34.89,
  },
  {
    territorio: "Território Alto da Serra",
    bairro: "Alto da Serra",
    total_familias: 343,
    centroide_lat: -7.08,
    centroide_lng: -34.84,
  },
];

export const DASHBOARD_BENEFICIOS: BenefitReportItem[] = [
  { tipo_beneficio: "Cesta básica", total_concessoes: 48, valor_total: 6720 },
  { tipo_beneficio: "Auxílio natalidade", total_concessoes: 12, valor_total: 3600 },
  { tipo_beneficio: "Auxílio funeral", total_concessoes: 7, valor_total: 5250 },
  { tipo_beneficio: "Passagem", total_concessoes: 30, valor_total: 1500 },
];

export const DASHBOARD_INDICADORES: IndicatorsOut = {
  total_familias: 1876,
  pbf: 1123,
  pbf_percentual: 59.9,
  bpc: 208,
  bpc_percentual: 11.1,
  cadunico_desatualizado_24m: 264,
  inseguranca_alimentar: 141,
  renda_por_faixa: [
    { faixa: "EXTREMA_POBREZA", total: 512 },
    { faixa: "ATE_MEIO_SM", total: 731 },
    { faixa: "MEIO_A_UM_SM", total: 402 },
    { faixa: "ACIMA_UM_SM", total: 231 },
  ],
};
