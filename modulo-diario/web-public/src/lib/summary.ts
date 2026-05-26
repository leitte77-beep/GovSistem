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

function formatWord(word: string): string {
  const match = word.match(/^([^A-Za-zÀ-ÿ]*)([A-Za-zÀ-ÿº°]+)([^A-Za-zÀ-ÿ]*)$/);
  if (!match) return word;

  const [, prefix, core, suffix] = match;
  const upper = core.toUpperCase();

  if (ACRONYMS.has(upper) || core.length <= 2) {
    return `${prefix}${upper}${suffix}`;
  }

  return `${prefix}${core.charAt(0).toUpperCase()}${core.slice(1).toLowerCase()}${suffix}`;
}

export function formatSummary(summary?: string | null): string {
  const clean = (summary || "Súmula não informada.")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();

  if (!clean) return "Súmula não informada.";

  return clean
    .split(" ")
    .map(formatWord)
    .join(" ")
    .replace(/\bDe\b/g, "de")
    .replace(/\bDa\b/g, "da")
    .replace(/\bDas\b/g, "das")
    .replace(/\bDo\b/g, "do")
    .replace(/\bDos\b/g, "dos")
    .replace(/\bE\b/g, "e")
    .replace(/\bEm\b/g, "em")
    .replace(/\bPara\b/g, "para")
    .replace(/\bCom\b/g, "com")
    .replace(/\bReferente\b/g, "referente")
    .replace(/\bManutenção\b/g, "manutenção")
    .replace(/\bDesenvolvimento\b/g, "desenvolvimento");
}
