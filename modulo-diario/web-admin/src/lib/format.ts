/**
 * Formatação pt-BR (datas dd/MM/yyyy, horas 24h, fuso America/Sao_Paulo)
 * e pluralização. Nunca depende do formato nativo americano de inputs.
 */

const PT_BR_TZ = "America/Sao_Paulo";

/** Converte string ISO/UTC ou Date para um objeto Date válido. */
function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  // Valor somente-data (YYYY-MM-DD): interpreta como data local, sem deslocar
  // para o dia anterior por causa do fuso (ex.: 2026-09-01 != 31/08).
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    const dt = new Date(y, m - 1, d, 12, 0, 0);
    return isNaN(dt.getTime()) ? null : dt;
  }
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/** dd/MM/yyyy (ex.: 01/09/2026). */
export function formatDate(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: PT_BR_TZ, day: "2-digit", month: "2-digit", year: "numeric",
  }).format(d);
}

/** dd/MM/yyyy HH:mm (24h, fuso São Paulo). */
export function formatDateTime(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "—";
  const raw = new Intl.DateTimeFormat("pt-BR", {
    timeZone: PT_BR_TZ,
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(d);
  // Intl pt-BR gera "01/09/2026, 11:05" -> normalizar para "01/09/2026 11:05"
  return raw.replace(/, /, " ");
}

/** HH:mm (24h). */
export function formatTime(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: PT_BR_TZ, hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(d);
}

/** Data por extenso, ex.: "1º de setembro de 2026". */
export function formatDateLong(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "—";
  const day = new Intl.DateTimeFormat("pt-BR", { timeZone: PT_BR_TZ, day: "2-digit" }).format(d);
  const month = new Intl.DateTimeFormat("pt-BR", { timeZone: PT_BR_TZ, month: "long" }).format(d);
  const year = new Intl.DateTimeFormat("pt-BR", { timeZone: PT_BR_TZ, year: "numeric" }).format(d);
  const dayNum = parseInt(day, 10);
  const dayLabel = dayNum === 1 ? "1º" : String(dayNum);
  return `${dayLabel} de ${month} de ${year}`;
}

/** Pluralização pt-BR simples (0 matérias, 1 matéria, 2 matérias). */
export function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? `1 ${singular}` : `${count} ${plural}`;
}

/** Atalhos comuns. */
export function pluralMaterias(count: number): string {
  return pluralize(count, "matéria", "matérias");
}

export function pluralItens(count: number): string {
  return pluralize(count, "item", "itens");
}

export function pluralEdicoes(count: number): string {
  return pluralize(count, "edição", "edições");
}

export function pluralAnexos(count: number): string {
  return pluralize(count, "anexo", "anexos");
}
