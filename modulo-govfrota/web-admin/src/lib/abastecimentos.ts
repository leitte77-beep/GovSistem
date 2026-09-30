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

/** Alertas de conferência gravados no abastecimento (não bloqueiam o registro). */
export const ALERTAS: Record<string, string> = {
  DUPLICIDADE: "Possível duplicidade",
  CONSUMO_FORA_PADRAO: "Consumo fora do padrão",
  FORA_DO_HORARIO: "Fora do horário",
  SEM_DESLOCAMENTO: "Sem deslocamento",
  LITROS_ACIMA_MEDIA: "Litros acima da média",
};

export function rotuloAlerta(codigo: string): string {
  return ALERTAS[codigo] ?? codigo.replace(/_/g, " ").toLowerCase();
}

/** Medição do abastecimento: horas (máquinas) ou km. */
export function formatarMedicao(a: {
  quilometragem: number;
  horimetro?: string | number | null;
  veiculo_usa_horimetro?: boolean | null;
}): string {
  if (a.horimetro !== null && a.horimetro !== undefined && a.horimetro !== "") return formatarKm(a.horimetro, true);
  if (a.veiculo_usa_horimetro) return "—";
  return formatarKm(a.quilometragem);
}

/** Onde abasteceu: nome do posto credenciado ou do tanque próprio. */
export function localAbastecimento(a: { modalidade?: string; fornecedor_nome?: string | null; tanque_nome?: string | null }): string {
  if (a.modalidade === "POSTO_CREDENCIADO") return a.fornecedor_nome ? `${a.fornecedor_nome} (posto)` : "Posto credenciado";
  return a.tanque_nome ?? "—";
}

/** Consumo do registro: km/L ou, em máquinas, L/h. */
export function formatarConsumoRegistro(a: { consumo_km_l?: number | string | null; consumo_l_h?: number | string | null }): string {
  if (a.consumo_l_h !== null && a.consumo_l_h !== undefined && a.consumo_l_h !== "") {
    const num = Number(a.consumo_l_h);
    if (!isNaN(num) && num > 0) return `${num.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} L/h`;
  }
  return formatarConsumo(a.consumo_km_l);
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
