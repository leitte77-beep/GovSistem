// Pure helpers to group matters by their legal kind (derived from the real
// title text) and by the caderno section they were published under. Used to
// build honest, data-driven filters/summary — no invented fields.

import type { MatterMeta } from "./edition-types";

export type MatterKindKey =
  | "leis"
  | "decretos"
  | "portarias"
  | "resolucoes"
  | "licitacoes"
  | "contratos"
  | "extratos"
  | "outros";

export const KIND_ORDER: MatterKindKey[] = [
  "leis",
  "decretos",
  "portarias",
  "resolucoes",
  "licitacoes",
  "contratos",
  "extratos",
  "outros",
];

export const KIND_LABEL: Record<MatterKindKey, string> = {
  leis: "Leis",
  decretos: "Decretos",
  portarias: "Portarias",
  resolucoes: "Resoluções",
  licitacoes: "Licitações",
  contratos: "Contratos",
  extratos: "Extratos",
  outros: "Outros",
};

// Anchored, ordered patterns on the normalized title. Only leading legal
// labels are matched to avoid miscategorizing body text.
const KIND_PATTERNS: Array<[MatterKindKey, RegExp]> = [
  ["leis", /^LEI\s/i],
  ["decretos", /^DECRETO\s/i],
  ["portarias", /^PORTARIA/i],
  ["resolucoes", /^RESOLU[ÇC][AÃ]O/i],
  ["licitacoes", /^LICITA[ÇC][AÃ]O/i],
  ["contratos", /^CONTRATO\s/i],
  ["extratos", /^EXTRATO/i],
];

export function matterKind(title: string | null | undefined): MatterKindKey {
  const t = (title || "").trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  for (const [key, re] of KIND_PATTERNS) {
    if (re.test(t)) return key;
  }
  return "outros";
}

export interface KindCount {
  key: MatterKindKey;
  label: string;
  count: number;
}

export function kindCounts(matters: MatterMeta[]): KindCount[] {
  const map = new Map<MatterKindKey, number>();
  for (const k of KIND_ORDER) map.set(k, 0);
  for (const m of matters) {
    const k = matterKind(m.title);
    map.set(k, (map.get(k) || 0) + 1);
  }
  return KIND_ORDER.map((key) => ({ key, label: KIND_LABEL[key], count: map.get(key) || 0 }));
}

export interface SectionCount {
  label: string;
  count: number;
}

export function sectionCounts(matters: MatterMeta[]): SectionCount[] {
  const map = new Map<string, number>();
  for (const m of matters) {
    const label = (m.section || "").trim() || "Geral";
    map.set(label, (map.get(label) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

/** Stable document anchor (the id used on the matter <section>). */
export function matterAnchorId(matter: MatterMeta): string {
  const base = slugify(matter.title || `materia-${matter.position}`);
  return `materia-${matter.id || base}`;
}

export function slugify(text: string): string {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
