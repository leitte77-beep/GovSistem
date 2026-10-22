const ACRONYMS = new Set([
  "ARP",
  "CNPJ",
  "CPF",
  "EPP",
  "ICMS",
  "ISS",
  "LGPD",
  "MDE",
  "ME",
  "Nº",
  "PDF",
  "PR",
]);

// Conectivos ficam em minúscula no meio da frase. Precisam ser checados antes
// da regra "palavra curta = sigla", senão "AO"/"DA"/"DE" saem em caixa alta.
const LOWERCASE = new Set([
  "a", "à", "ao", "aos", "as", "às", "o", "os",
  "de", "da", "das", "do", "dos", "e", "em", "na", "nas", "no", "nos",
  "para", "por", "pela", "pelas", "pelo", "pelos", "com", "sem", "sob", "ou",
  "referente", "manutenção", "desenvolvimento",
]);

function formatWord(word: string, index: number): string {
  const match = word.match(/^([^A-Za-zÀ-ÿ]*)([A-Za-zÀ-ÿº°]+)([^A-Za-zÀ-ÿ]*)$/);
  if (!match) return word;

  const [, prefix, core, suffix] = match;
  const upper = core.toUpperCase();
  const lower = core.toLowerCase();

  if (ACRONYMS.has(upper)) return `${prefix}${upper}${suffix}`;
  if (index > 0 && !prefix && LOWERCASE.has(lower)) return `${prefix}${lower}${suffix}`;
  if (core.length <= 2) return `${prefix}${upper}${suffix}`;

  return `${prefix}${core.charAt(0).toUpperCase()}${lower.slice(1)}${suffix}`;
}

/** Normaliza texto vindo em CAIXA ALTA (súmulas, nome do órgão) para leitura. */
export function formatTitleCase(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map(formatWord)
    .join(" ");
}

export function formatSummary(summary?: string | null): string {
  const clean = (summary || "Súmula não informada.")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();

  if (!clean) return "Súmula não informada.";

  return formatTitleCase(clean);
}
