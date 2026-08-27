// Utilidades da área de Ocorrências: humanização de enums e formatação.

export const CATEGORIAS: Record<string, string> = {
  MECANICO: "Mecânico",
  PNEU: "Pneu",
  LUZ_PAINEL: "Painel",
  FREIO: "Freio",
  AVARIA: "Avaria",
  ACIDENTE: "Acidente",
  ELETRICO: "Elétrica",
  OUTRO: "Outro",
};

export const CATEGORIAS_LISTA = Object.entries(CATEGORIAS);

export const GRAVIDADES: Record<string, { rotulo: string; classe: string; cor: string }> = {
  BAIXA: { rotulo: "Baixa", classe: "bg-gray-100 text-gray-600", cor: "bg-gray-400" },
  MEDIA: { rotulo: "Média", classe: "bg-info-vibrant/10 text-info-vibrant", cor: "bg-info-vibrant" },
  ALTA: { rotulo: "Alta", classe: "bg-warning-vibrant/10 text-warning-vibrant", cor: "bg-warning-vibrant" },
  CRITICA: { rotulo: "Crítica", classe: "bg-error-vibrant/10 text-error-vibrant", cor: "bg-error-vibrant" },
};

export const GRAVIDADES_LISTA = Object.keys(GRAVIDADES);

export const STATUS: Record<string, { rotulo: string; classe: string; cor: string }> = {
  ABERTA: { rotulo: "Aberta", classe: "bg-error-vibrant/10 text-error-vibrant border-error-vibrant/20", cor: "bg-error-vibrant" },
  EM_ANALISE: { rotulo: "Em análise", classe: "bg-warning-vibrant/10 text-warning-vibrant border-warning-vibrant/20", cor: "bg-warning-vibrant" },
  RESOLVIDA: { rotulo: "Resolvida", classe: "bg-success-vibrant/10 text-success-vibrant border-success-vibrant/20", cor: "bg-success-vibrant" },
  CONVERTIDA_EM_MANUTENCAO: { rotulo: "Convertida em manutenção", classe: "bg-info-vibrant/10 text-info-vibrant border-info-vibrant/20", cor: "bg-info-vibrant" },
};

export const STATUS_LISTA = [
  { valor: "", rotulo: "Todas" },
  { valor: "ABERTA", rotulo: "Abertas" },
  { valor: "EM_ANALISE", rotulo: "Em análise" },
  { valor: "RESOLVIDA", rotulo: "Resolvidas" },
  { valor: "CONVERTIDA_EM_MANUTENCAO", rotulo: "Convertidas em manutenção" },
];

export const ORIGENS: Record<string, { rotulo: string; classe: string }> = {
  APP_MOTORISTA: { rotulo: "Motorista", classe: "bg-surface-container-highest text-on-surface-variant" },
  ADMIN: { rotulo: "Administrativo", classe: "bg-info-vibrant/10 text-info-vibrant" },
};

export function categoriaRotulo(c: string | null | undefined): string {
  return CATEGORIAS[c || ""] || (c ? c.replace(/_/g, " ") : "—");
}

export function gravidadeInfo(g: string | null | undefined) {
  return GRAVIDADES[g || ""] ?? GRAVIDADES.MEDIA;
}

export function statusInfo(s: string | null | undefined) {
  return STATUS[s || ""] ?? STATUS.ABERTA;
}

export function origemInfo(o: string | null | undefined) {
  return ORIGENS[o || ""] ?? ORIGENS.ADMIN;
}

export function formatarKm(valor: number | string | null | undefined, horimetro = false): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  const num = Number(valor);
  if (isNaN(num)) return "—";
  if (horimetro) return `${num.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;
  return `${num.toLocaleString("pt-BR")} km`;
}

export function formatarDataHora(data: string | null | undefined): string {
  if (!data) return "—";
  const d = new Date(data);
  if (isNaN(d.getTime())) return data;
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}
