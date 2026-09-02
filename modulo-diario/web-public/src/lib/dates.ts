const WEEKDAYS = [
  "Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira",
  "Quinta-feira", "Sexta-feira", "Sábado",
];
const WEEKDAYS_UP = [
  "DOMINGO", "SEGUNDA-FEIRA", "TERÇA-FEIRA", "QUARTA-FEIRA",
  "QUINTA-FEIRA", "SEXTA-FEIRA", "SÁBADO",
];
const MONTHS_UP = [
  "JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO",
  "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO",
];
const MONTHS_PT = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export function formatBrasiliaDateTime(value: string | null | undefined) {
  if (!value) return "";

  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(normalized));
}

/** "QUARTA-FEIRA, 02 DE SETEMBRO DE 2026" — official header style. */
export function formatHeaderDate(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(`${value}T12:00:00`);
  return `${WEEKDAYS_UP[date.getDay()]}, ${String(date.getDate()).padStart(2, "0")} DE ${MONTHS_UP[date.getMonth()]} DE ${date.getFullYear()}`;
}

/** "02 de setembro de 2026" — human friendly. */
export function formatLongDatePT(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(`${value}T12:00:00`);
  return `${String(date.getDate()).padStart(2, "0")} de ${MONTHS_PT[date.getMonth()]} de ${date.getFullYear()}`;
}

export function weekdayPT(value: string | null | undefined): string {
  if (!value) return "";
  return WEEKDAYS[new Date(`${value}T12:00:00`).getDay()];
}
