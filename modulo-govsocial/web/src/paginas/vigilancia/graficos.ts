import type {
  BenefitReportItem,
  FaixaRendaItem,
  MapItem,
  TimeSeriesItem,
} from "@/tipos/dashboard";

/**
 * Funções puras de gráfico (§4.9) — sem React nem SVG.
 * Donut e barras recebem números e devolvem geometria + rótulos textuais
 * (acessibilidade: nada é comunicado só por cor).
 */

const MESES_CURTOS = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

export function rotuloMesCurto(mes: number): string {
  return MESES_CURTOS[mes - 1] ?? String(mes);
}

export type FatiaDonut = {
  rotulo: string;
  valor: number;
  percentual: number;
  /** offset acumulado (0–100) para desenhar o arco. */
  inicio: number;
};

/**
 * Calcula as fatias de um donut com percentuais arredondados. A soma dos
 * valores define o total; itens com valor 0 são mantidos (percentual 0).
 */
export function calcularFatiasDonut(
  itens: { rotulo: string; valor: number }[],
): { total: number; fatias: FatiaDonut[] } {
  const total = itens.reduce((s, i) => s + Math.max(0, i.valor), 0);
  let acumulado = 0;
  const fatias = itens.map((i) => {
    const valor = Math.max(0, i.valor);
    const percentual = total > 0 ? (valor / total) * 100 : 0;
    const fatia: FatiaDonut = {
      rotulo: i.rotulo,
      valor,
      percentual,
      inicio: acumulado,
    };
    acumulado += percentual;
    return fatia;
  });
  return { total, fatias };
}

/** Percentual inteiro (para exibição). */
export function percentualInteiro(valor: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((valor / total) * 100);
}

export type BarraSerie = {
  rotulo: string;
  valor: number;
  /** altura relativa 0–1 em relação ao máximo da série. */
  fracao: number;
};

/** Normaliza uma série numérica em barras (fração do máximo). */
export function normalizarBarras(
  itens: { rotulo: string; valor: number }[],
): { maximo: number; barras: BarraSerie[] } {
  const maximo = itens.reduce((m, i) => Math.max(m, i.valor), 0);
  const barras = itens.map((i) => ({
    rotulo: i.rotulo,
    valor: i.valor,
    fracao: maximo > 0 ? i.valor / maximo : 0,
  }));
  return { maximo, barras };
}

/** Converte a série temporal em barras de atendimentos por mês. */
export function serieAtendimentosParaBarras(serie: TimeSeriesItem[]): {
  rotulo: string;
  valor: number;
}[] {
  return serie.map((s) => ({ rotulo: rotuloMesCurto(s.mes), valor: s.atendimentos }));
}

/** Converte o relatório de benefícios em itens de donut (por total). */
export function beneficiosParaDonut(
  itens: BenefitReportItem[],
): { rotulo: string; valor: number }[] {
  return itens.map((b) => ({ rotulo: b.tipo_beneficio, valor: b.total_concessoes }));
}

const ROTULO_FAIXA_RENDA: Record<string, string> = {
  EXTREMA_POBREZA: "Extrema pobreza",
  ATE_MEIO_SM: "Até ½ salário mínimo",
  MEIO_A_UM_SM: "½ a 1 salário mínimo",
  ACIMA_UM_SM: "Acima de 1 salário mínimo",
  NAO_INFORMADO: "Não informado",
};

export function rotuloFaixaRenda(faixa: string): string {
  return ROTULO_FAIXA_RENDA[faixa] ?? faixa;
}

export function faixaRendaParaDonut(
  itens: FaixaRendaItem[],
): { rotulo: string; valor: number }[] {
  return itens.map((f) => ({ rotulo: rotuloFaixaRenda(f.faixa), valor: f.total }));
}

/** Paleta acessível para as fatias/barras (tokens de evento, contraste AA). */
export const PALETA_GRAFICO = [
  "var(--ga-primary)",
  "#0B5563",
  "#7A5230",
  "var(--ga-sensitive)",
  "#46626B",
  "var(--ga-amber)",
];

export function corDaFatia(indice: number): string {
  return PALETA_GRAFICO[indice % PALETA_GRAFICO.length];
}

export type PontoMapa = {
  x: number;
  y: number;
  raio: number;
  item: MapItem;
};

/**
 * Projeta os centroides (lat/lng) num plano SVG de dimensões dadas, com padding.
 * O raio da bolha é proporcional ao total de famílias (mapa de calor). Itens
 * sem coordenadas são descartados. Um único ponto vai ao centro.
 */
export function projetarMapa(
  itens: MapItem[],
  largura: number,
  altura: number,
  padding = 12,
  raioMin = 6,
  raioMax = 26,
): PontoMapa[] {
  const validos = itens.filter(
    (i) => i.centroide_lat != null && i.centroide_lng != null,
  );
  if (validos.length === 0) return [];

  const lats = validos.map((i) => i.centroide_lat as number);
  const lngs = validos.map((i) => i.centroide_lng as number);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const maxFam = Math.max(...validos.map((i) => i.total_familias), 1);

  const spanLng = maxLng - minLng || 1;
  const spanLat = maxLat - minLat || 1;
  const w = largura - padding * 2;
  const h = altura - padding * 2;

  return validos.map((item) => {
    const lng = item.centroide_lng as number;
    const lat = item.centroide_lat as number;
    const x =
      validos.length === 1 ? largura / 2 : padding + ((lng - minLng) / spanLng) * w;
    // Latitude maior = mais ao norte = topo (y menor) → inverte.
    const y =
      validos.length === 1 ? altura / 2 : padding + (1 - (lat - minLat) / spanLat) * h;
    const raio = raioMin + (item.total_familias / maxFam) * (raioMax - raioMin);
    return { x, y, raio, item };
  });
}
