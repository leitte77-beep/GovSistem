/**
 * Pure helpers for structured act identification (type/number/year/title).
 *
 * Architecture note: numbering rules are configurable per act type via
 * `ActType.config` (DB). Defaults here only apply when no config exists,
 * so the frontend never hardcodes per-type behavior.
 */

export interface ActTypeConfig {
  number_required?: boolean;
  year_required?: boolean;
  date_required?: boolean;
  title_pattern?: string | null; // supports {number} {year} tokens (etc.)
  title_uppercase?: boolean;
  dynamic_fields?: unknown[];
}

const DEFAULT_CONFIG: Required<Pick<ActTypeConfig, "number_required" | "year_required" | "title_uppercase">> = {
  number_required: true,
  year_required: true,
  title_uppercase: true,
};

/** Normalize config with safe defaults. */
export function actTypeConfig(config?: ActTypeConfig | null): ActTypeConfig {
  return { ...DEFAULT_CONFIG, ...config };
}

/** "PORTARIA Nº 04/2026" — respects per-type pattern when provided. */
export function suggestTitle(
  actTypeName: string,
  actNumber: string | null,
  actYear: number | null,
  config?: ActTypeConfig | null
): string {
  const cfg = actTypeConfig(config);
  const name = actTypeName?.trim() || "";
  if (!name) return "";

  if (cfg.title_pattern) {
    return cfg.title_pattern
      .replace("{name}", name.toUpperCase())
      .replace("{number}", actNumberLabel(actNumber))
      .replace("{year}", actYearLabel(actYear))
      .trim();
  }

  const parts: string[] = [name.toUpperCase()];
  if (actNumber || actYear) {
    parts.push(`Nº ${actNumberLabel(actNumber)}${actYear ? `/${actYear}` : ""}`);
  }
  return parts.join(" ");
}

function actNumberLabel(actNumber: string | null | undefined): string {
  if (!actNumber) return "__";
  return actNumber.padStart(2, "0");
}

function actYearLabel(actYear: number | null | undefined): string {
  return actYear ? String(actYear) : "____";
}

/**
 * Known act-type keywords used to detect inconsistency between the
 * selected type and a manually typed title. Advisory only — never blocking.
 */
const TYPE_KEYWORDS: Record<string, string[]> = {
  portaria: ["portaria"],
  decreto: ["decreto"],
  lei: ["lei"],
  edital: ["edital"],
  ata: ["ata"],
  contrato: ["contrato"],
  licitacao: ["licitação", "licitacao"],
  "relatório contábil": ["relatório contábil", "relatorio contabil", "relatório"],
  resolucao: ["resolução", "resolucao"],
  outros: [],
};

function normalizeTypeKey(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Advisory checks for the identification step.
 * Returns human-readable warnings in pt-BR; empty list = consistent.
 */
export function identificationWarnings(input: {
  actTypeName: string | null;
  actNumber: string | null;
  actYear: number | null;
  title: string;
}): string[] {
  const warnings: string[] = [];
  const { actTypeName, actNumber, actYear, title } = input;
  const t = (title || "").toUpperCase();

  if (actTypeName) {
    const key = normalizeTypeKey(actTypeName);
    const expected = TYPE_KEYWORDS[key] ?? [];
    if (expected.length > 0) {
      const matches = expected.some((kw) =>
        t.includes(kw.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""))
      );
      const hasOtherType = Object.entries(TYPE_KEYWORDS).some(
        ([otherKey, kws]) =>
          otherKeyIsDifferent(otherKey, key) &&
          kwsMatch(kws, t)
      );
      if (!matches && hasTypeKeyword(t)) {
        // title mentions some act type but not the selected one
        if (hasTypeKeyword(t) && !matches) {
          warnings.push(
            `Possível inconsistência: o tipo selecionado é ${actTypeName}, mas o título parece corresponder a outro tipo de ato.`
          );
        }
      }
    }
  }

  if (actNumber && /\d+\s*\/\s*\d{4}/.test(t)) {
    const m = t.match(/N[Oº°]?\s*0*(\d+)\s*\/\s*(\d{4})/);
    if (m) {
      const titleNumber = String(parseInt(m[1], 10));
      const titleYear = m[2];
      if (parseInt(m[1], 10) !== parseInt(actNumber, 10)) {
        warnings.push(
          `O número no título (${titleNumber}) diverge do número informado (${actNumber}).`
        );
      }
      if (actYear && titleYear !== String(actYear)) {
        warnings.push(
          `O ano no título (${titleYear}) diverge do ano informado (${actYear}).`
        );
      }
    }
  }

  return warnings;
}

function otherKeyIsDifferent(keyA: string, keyB: string): boolean {
  return keyA !== keyB;
}

function kwsMatch(kws: string[], title: string): boolean {
  return kws.some((kw) =>
    title.includes(kw.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""))
  );
}

function hasTypeKeyword(title: string): boolean {
  return Object.values(TYPE_KEYWORDS).some((kws) => kws.length > 0 && kwsMatch(kws, title));
}

/**
 * Extract structured number/year from a legacy title like "PORTARIA – 04/2026".
 * Used ONLY with explicit user confirmation ("Aplicar") for old matters.
 */
export function parseTitleMetadata(title: string): { number: string | null; year: number | null } {
  const m = (title || "").match(/(\d+)\s*\/\s*(\d{4})\s*$/);
  if (m) {
    return { number: String(parseInt(m[1], 10)), year: parseInt(m[2], 10) };
  }
  return { number: null, year: null };
}
