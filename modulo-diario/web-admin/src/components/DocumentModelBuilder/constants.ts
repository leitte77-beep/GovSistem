import type {
  DocumentField,
  DocumentFieldType,
  DocumentLayout,
  DocumentModelConfig,
  DocumentSection,
  DocumentSectionKind,
} from "@/types/document_model";

export const TIPO_LABEL: Record<string, string> = {
  decreto: "Decreto",
  portaria: "Portaria",
  lei: "Lei",
  edital: "Edital",
  licitacao: "Licitação",
  contrato: "Contrato/Termo",
  relatorio: "Relatório/Laudo",
  extrato: "Extrato",
  audiencia: "Audiência pública",
  oficio: "Ofício",
  resolucao: "Resolução",
  outro: "Outro",
};

export const TIPOS = Object.keys(TIPO_LABEL);

export const FIELD_TYPE_LABEL: Record<DocumentFieldType, string> = {
  text: "Texto",
  date: "Data",
  integer: "Número inteiro",
  decimal: "Decimal",
  money: "Moeda (R$)",
  select: "Seleção",
  reference: "Referência",
};

export const SECTION_KIND_LABEL: Record<DocumentSectionKind, string> = {
  heading: "Título",
  preamble: "Preâmbulo",
  command: "Comando",
  paragraph: "Parágrafo",
  article: "Artigo",
  paragraph_item: "Parágrafo (item)",
  inciso: "Inciso",
  alinea: "Alínea",
  quote: "Citação",
  table: "Tabela",
  signature_block: "Assinatura",
  attachment_reference: "Anexo",
};

export interface ElementDef {
  kind: DocumentSectionKind;
  label: string;
  icon: string;
  description: string;
  defaultText?: string;
  level?: number;
}

/** Elementos que podem ser raiz do documento. */
export const ROOT_ELEMENTS: ElementDef[] = [
  { kind: "heading", label: "Título", icon: "title", description: "Título ou seção", defaultText: "Título" },
  {
    kind: "preamble",
    label: "Preâmbulo",
    icon: "subject",
    description: "Texto de abertura",
    defaultText: "O Prefeito Municipal, no uso de suas atribuições legais,",
  },
  {
    kind: "command",
    label: "Comando",
    icon: "terminal",
    description: "RESOLVE / DECRETA",
    defaultText: "RESOLVE:",
  },
  {
    kind: "paragraph",
    label: "Parágrafo",
    icon: "notes",
    description: "Parágrafo de texto",
    defaultText: "",
  },
  {
    kind: "article",
    label: "Artigo",
    icon: "gavel",
    description: "Dispositivo com incisos/parágrafos",
    defaultText: "Conceder ao servidor {{servidor}}.",
  },
  {
    kind: "quote",
    label: "Citação",
    icon: "format_quote",
    description: "Citação de norma/trecho",
    defaultText: "",
  },
  {
    kind: "table",
    label: "Tabela",
    icon: "table_chart",
    description: "Quadro estruturado com campos variáveis",
  },
  {
    kind: "signature_block",
    label: "Assinatura",
    icon: "draw",
    description: "Nome e cargo da autoridade",
    defaultText: "",
  },
  {
    kind: "attachment_reference",
    label: "Anexo",
    icon: "attach_file",
    description: "Referência a anexo",
    defaultText: "Anexo I",
  },
];

/** Sub-blocos permitidos dentro de um artigo. */
export const ARTICLE_CHILD_ELEMENTS: ElementDef[] = [
  { kind: "paragraph_item", label: "Parágrafo", icon: "notes", description: "§ / Parágrafo único" },
  { kind: "inciso", label: "Inciso", icon: "format_list_numbered", description: "I, II, III…" },
  { kind: "alinea", label: "Alínea", icon: "format_list_bulleted", description: "a), b), c)…" },
];

const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export function newId(prefix = "s"): string {
  let out = "";
  for (let i = 0; i < 10; i += 1) {
    out += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)];
  }
  return `${prefix}_${out}`;
}

export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function emptyConfig(purpose = ""): DocumentModelConfig {
  return {
    purpose: purpose || "Nova finalidade",
    description: "",
    scope_document_type: "portaria",
    document_title: "",
    summary: "",
    fields: [],
    sections: [],
  };
}

export function defaultLayout(): DocumentLayout {
  return {
    page_size: "A4",
    orientation: "portrait",
    margins: { top: 20, right: 18, bottom: 20, left: 18 },
    body_font: { family: "Times New Roman", size: 12, line_height: 1.5, color: "#000000" },
    heading_font: null,
    header: {
      enabled: true,
      show_coat_of_arms: true,
      show_institution_name: true,
      show_address: true,
      show_cnpj: true,
      show_phone: true,
      show_site: true,
      custom_html: "",
      alignment: "center",
    },
    footer: {
      enabled: true,
      show_page_numbers: true,
      page_number_format: "Página {page} de {total}",
      custom_html: "",
      alignment: "center",
    },
    show_coat_of_arms: true,
    coat_of_arms_url: null,
    background_color: "#FFFFFF",
    accent_color: "#001631",
  };
}

export function sectionFromElement(def: ElementDef): DocumentSection {
  const base: DocumentSection = {
    id: newId(def.kind.slice(0, 3)),
    kind: def.kind,
    text: def.defaultText ?? "",
    alignment: def.kind === "heading" || def.kind === "command" ? "center" : "justify",
    level: def.level ?? 1,
  };
  if (def.kind === "signature_block") {
    base.entries = [{ name: "", role: "" }];
    base.alignment = "center";
  }
  if (def.kind === "article") {
    base.number = null;
    base.children = [];
  }
  if (def.kind === "table") {
    base.table_headers = ["Campo", "Valor"];
    base.table_rows = [["", ""]];
    base.table_column_widths = [35, 65];
  }
  return base;
}

export function newField(index: number): DocumentField {
  return {
    key: `campo_${index}`,
    label: `Campo ${index}`,
    type: "text",
    required: false,
    options: [],
    help: "",
    required_when: [],
  };
}

const MARKER_RE = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

/** Retorna as chaves de campo referenciadas em um texto ({{chave}}). */
export function markersIn(text: string | null | undefined): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (const m of text.matchAll(MARKER_RE)) out.push(m[1]);
  return out;
}

export function fieldByKey(config: DocumentModelConfig, key: string): DocumentField | undefined {
  return config.fields.find((f) => f.key === key);
}

// ── Manipulação da árvore de seções ───────────────────────────────────────

export function findSection(
  sections: DocumentSection[],
  id: string
): DocumentSection | null {
  for (const s of sections) {
    if (s.id === id) return s;
    const child = s.children ? findSection(s.children, id) : null;
    if (child) return child;
  }
  return null;
}

export function mapSections(
  sections: DocumentSection[],
  id: string,
  patch: Partial<DocumentSection>
): DocumentSection[] {
  return sections.map((s) => {
    if (s.id === id) return { ...s, ...patch };
    if (s.children && s.children.length > 0) {
      return { ...s, children: mapSections(s.children, id, patch) };
    }
    return s;
  });
}

export function removeSection(
  sections: DocumentSection[],
  id: string
): DocumentSection[] {
  return sections
    .filter((s) => s.id !== id)
    .map((s) =>
      s.children && s.children.length > 0
        ? { ...s, children: removeSection(s.children, id) }
        : s
    );
}

function cloneSection(section: DocumentSection): DocumentSection {
  return {
    ...section,
    id: newId(section.kind.slice(0, 3)),
    entries: section.entries?.map((e) => ({ ...e })),
    children: section.children?.map(cloneSection),
  };
}

/** Clona seções gerando novos ids (usado ao inserir um bloco). */
export function instantiateSections(sections: DocumentSection[]): DocumentSection[] {
  return sections.map(cloneSection);
}

/** Cria uma seção simples a partir de um kind e texto (bloco novo). */
export function sectionFromKind(kind: DocumentSectionKind, text: string): DocumentSection {
  const def = ROOT_ELEMENTS.find((e) => e.kind === kind);
  const section = def
    ? sectionFromElement(def)
    : { id: newId("blk"), kind, text, alignment: "justify", level: 1 };
  section.text = text;
  return section;
}

/** Reordena uma seção entre os irmãos (raiz ou filhos). */
export function moveSection(
  sections: DocumentSection[],
  id: string,
  dir: -1 | 1
): DocumentSection[] {
  const idx = sections.findIndex((s) => s.id === id);
  if (idx >= 0) {
    const target = idx + dir;
    if (target < 0 || target >= sections.length) return sections;
    const copy = [...sections];
    [copy[idx], copy[target]] = [copy[target], copy[idx]];
    return copy;
  }
  return sections.map((s) =>
    s.children && s.children.length > 0
      ? { ...s, children: moveSection(s.children, id, dir) }
      : s
  );
}

export function duplicateSectionInTree(
  sections: DocumentSection[],
  id: string
): DocumentSection[] {
  const idx = sections.findIndex((s) => s.id === id);
  if (idx >= 0) {
    const copy = [...sections];
    copy.splice(idx + 1, 0, cloneSection(sections[idx]));
    return copy;
  }
  return sections.map((s) =>
    s.children && s.children.length > 0
      ? { ...s, children: duplicateSectionInTree(s.children, id) }
      : s
  );
}

/** Move `dragId` para antes de `targetId`, no mesmo nível (irmãos). */
export function reorderSection(
  sections: DocumentSection[],
  dragId: string,
  targetId: string
): DocumentSection[] {
  const dragIdx = sections.findIndex((s) => s.id === dragId);
  const targetIdx = sections.findIndex((s) => s.id === targetId);
  if (dragIdx >= 0 && targetIdx >= 0) {
    const moved = sections[dragIdx];
    const without = sections.filter((s) => s.id !== dragId);
    const insertAt = without.findIndex((s) => s.id === targetId);
    if (insertAt < 0) return sections;
    const copy = [...without];
    copy.splice(insertAt, 0, moved);
    return copy;
  }
  return sections.map((s) =>
    s.children && s.children.length > 0
      ? { ...s, children: reorderSection(s.children, dragId, targetId) }
      : s
  );
}

function replaceMarker(text: string | null | undefined, from: string, to: string): string {
  if (!text) return text ?? "";
  return text.replace(
    new RegExp(`\\{\\{\\s*${from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\}\\}`, "g"),
    to ? `{{${to}}}` : ""
  );
}

function transformSectionTexts(
  sections: DocumentSection[],
  fn: (s: DocumentSection) => DocumentSection
): DocumentSection[] {
  return sections.map((s) => {
    const next = fn(s);
    if (next.children && next.children.length > 0) {
      return { ...next, children: transformSectionTexts(next.children, fn) };
    }
    return next;
  });
}

/** Remove/renomeia referências a um campo em todos os textos e condições. */
export function renameFieldRefs(
  config: DocumentModelConfig,
  from: string,
  to: string
): DocumentModelConfig {
  const sections = transformSectionTexts(config.sections, (s) => {
    const next = { ...s };
    next.text = replaceMarker(s.text, from, to);
    next.number = replaceMarker(s.number, from, to) || null;
    next.suffix = replaceMarker(s.suffix, from, to) || null;
    if (s.when_field === from) next.when_field = to || null;
    if (s.entries) {
      next.entries = s.entries.map((e) => ({
        ...e,
        name: replaceMarker(e.name, from, to),
        role: replaceMarker(e.role, from, to),
      }));
    }
    return next;
  });
  return {
    ...config,
    document_title: replaceMarker(config.document_title, from, to),
    summary: replaceMarker(config.summary, from, to),
    fields: config.fields.map((f) => ({
      ...f,
      required_when: (f.required_when ?? [])
        .map((c) => (c.field === from ? { ...c, field: to } : c))
        .filter((c) => c.field),
    })),
    sections,
  };
}

/** Remove um campo e todas as referências a ele (marcadores/condições). */
export function stripField(config: DocumentModelConfig, key: string): DocumentModelConfig {
  const cleaned = renameFieldRefs(config, key, "");
  return {
    ...cleaned,
    fields: cleaned.fields.filter((f) => f.key !== key),
  };
}
