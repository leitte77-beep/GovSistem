// Utilidades da área de Abastecimentos: formatação pt-BR e badges.

export const ORIGENS: Record<string, { rotulo: string; classe: string }> = {
  ADMIN: { rotulo: "Administrativo", classe: "bg-info-vibrant/10 text-info-vibrant" },
  APP_MOTORISTA: { rotulo: "Motorista", classe: "bg-surface-container-highest text-on-surface-variant" },
  IMPORTADO: { rotulo: "Importado", classe: "bg-purple-50 text-purple-700" },
};

export const STATUS: Record<string, { rotulo: string; classe: string; cor: string }> = {
  CONFIRMADO: { rotulo: "Confirmado", classe: "bg-success-vibrant/10 text-success-vibrant border-success-vibrant/20", cor: "bg-success-vibrant" },
  CORRIGIDO: { rotulo: "Corrigido", classe: "bg-info-vibrant/10 text-info-vibrant border-info-vibrant/20", cor: "bg-info-vibrant" },
  CANCELADO: { rotulo: "Cancelado", classe: "bg-error-vibrant/10 text-error-vibrant border-error-vibrant/20", cor: "bg-error-vibrant" },
};

export function origemInfo(origem: string | null | undefined) {
  return ORIGENS[origem || ""] ?? ORIGENS.APP_MOTORISTA;
}

export function statusInfo(status: string | null | undefined) {
  return STATUS[status || ""] ?? STATUS.CONFIRMADO;
}

// Formatadores pt-BR
export function formatarLitros(valor: number | string | null | undefined): string {
  const num = Number(valor || 0);
  if (isNaN(num)) return "—";
  return `${num.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} L`;
}

export function formatarKm(valor: number | string | null | undefined, horimetro: boolean | null | undefined = false): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  const num = Number(valor);
  if (isNaN(num)) return "—";
  if (horimetro) return `${num.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;
  return `${num.toLocaleString("pt-BR")} km`;
}

/** Consumo: mostra "—" quando não calculável; nunca 0 km/L. */
export function formatarConsumo(consumo: number | string | null | undefined): string {
  if (consumo === null || consumo === undefined || consumo === "") return "—";
  const num = Number(consumo);
  if (isNaN(num) || num <= 0) return "Dados insuficientes";
  return `${num.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km/L`;
}

export function formatarMoeda(valor: number | string | null | undefined): string {
  const num = Number(valor);
  if (valor === null || valor === undefined || valor === "" || isNaN(num)) return "—";
  return `R$ ${num.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

export function formatarData(data: string | null | undefined): string {
  if (!data) return "—";
  const d = new Date(data);
  if (isNaN(d.getTime())) return data;
  return d.toLocaleDateString("pt-BR");
}

export function formatarDataHora(data: string | null | undefined): string {
  if (!data) return "—";
  const d = new Date(data);
  if (isNaN(d.getTime())) return data;
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function nomeVeiculo(a: { veiculo_placa?: string | null; veiculo_modelo?: string | null; veiculo_marca?: string | null }): string {
  return [a.veiculo_placa, [a.veiculo_marca, a.veiculo_modelo].filter(Boolean).join(" ")].filter(Boolean).join(" · ") || "—";
}

/** Idempotência: chave única por tentativa de lançamento (reenvio seguro). */
export function novaIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `abast_${crypto.randomUUID()}`;
  }
  return `abast_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
