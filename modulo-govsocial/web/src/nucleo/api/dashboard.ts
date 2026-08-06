import { http } from "@/nucleo/http/clienteHttp";
import type {
  BenefitReportItem,
  DashboardOverviewOut,
  IndicatorsOut,
  MapItem,
  TerritoryItem,
  TimeSeriesItem,
  DashboardActivityItem,
} from "@/tipos/dashboard";

/**
 * Serviços do Dashboard do gestor / Vigilância (Fase 8, §4.9).
 * Somente leituras agregadas; nenhuma PII trafega nestes contratos.
 */
export const servicoDashboard = {
  overview: () => http.get<DashboardOverviewOut>("/dashboard/overview"),

  serie: (meses = 12) =>
    http.get<TimeSeriesItem[]>(`/dashboard/time-series?meses=${meses}`),

  porTerritorio: () => http.get<TerritoryItem[]>("/dashboard/by-territory"),

  mapa: () => http.get<MapItem[]>("/dashboard/map"),

  beneficios: (params?: { ano?: number; mes?: number }) => {
    const qs = new URLSearchParams();
    if (params?.ano) qs.set("ano", String(params.ano));
    if (params?.mes) qs.set("mes", String(params.mes));
    const q = qs.toString();
    return http.get<BenefitReportItem[]>(`/dashboard/benefits-report${q ? `?${q}` : ""}`);
  },

  indicadores: () => http.get<IndicatorsOut>("/dashboard/indicators"),

  activity: (limit = 10) =>
    http.get<DashboardActivityItem[]>(`/dashboard/activity?limit=${limit}`),
};
