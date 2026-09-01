/**
 * TypeScript types mirroring the backend canonical semantic document
 * (app/semantic/schemas.py) and template management (app/semantic/templates.py).
 * Single source of truth for the block-based editor and template builder.
 */

export type SemanticBlockType =
  | "heading"
  | "preamble"
  | "command"
  | "paragraph"
  | "article"
  | "paragraph_item"
  | "inciso"
  | "alinea"
  | "list"
  | "table"
  | "image"
  | "quote"
  | "page_break"
  | "signature_block"
  | "attachment_reference"
  | "legacy_html"
  | "pdf_reference";

export interface BlockBase {
  id: string;
  type: SemanticBlockType;
  order: number;
  origin?: string;
  confidence?: number;
  confirmed?: boolean;
  metadata?: Record<string, unknown>;
  content_hash?: string | null;
}

export interface HeadingBlock extends BlockBase {
  type: "heading";
  level: number;
  text: string;
}

export interface PreambleBlock extends BlockBase {
  type: "preamble";
  content: string;
  rich?: boolean;
}

export interface CommandBlock extends BlockBase {
  type: "command";
  text: string;
}

export interface ParagraphBlock extends BlockBase {
  type: "paragraph";
  content: string;
  rich?: boolean;
}

export interface ParagraphItemBlock extends BlockBase {
  type: "paragraph_item";
  number?: string | null;
  content: string;
  text?: string;
  rich?: boolean;
}

export interface IncisoBlock extends BlockBase {
  type: "inciso";
  number: string;
  content: string;
  text?: string;
  rich?: boolean;
}

export interface AlineaBlock extends BlockBase {
  type: "alinea";
  number: string;
  content: string;
  text?: string;
  rich?: boolean;
}

export interface ListBlock extends BlockBase {
  type: "list";
  ordered: boolean;
  items: string[];
  content?: string;
  rich?: boolean;
}

export interface TableCell {
  content: string;
  rowspan: number;
  colspan: number;
  header: boolean;
  align?: string | null;
  valign?: string | null;
  is_total: boolean;
}

export interface TableBlock extends BlockBase {
  type: "table";
  caption: string;
  headers: string[];
  rows: TableCell[][];
  column_widths: number[];
  repeat_header: boolean;
  original_data: string[][];
}

export interface ImageBlock extends BlockBase {
  type: "image";
  src: string;
  alt: string;
  caption: string;
}

export interface QuoteBlock extends BlockBase {
  type: "quote";
  content: string;
  rich?: boolean;
}

export interface PageBreakBlock extends BlockBase {
  type: "page_break";
}

export interface SignatureEntry {
  name: string;
  role: string;
  organ: string;
  location: string;
  date: string;
  functional_id?: string | null;
}

export interface SignatureBlock extends BlockBase {
  type: "signature_block";
  entries: SignatureEntry[];
  alignment: string;
}

export interface AttachmentReferenceBlock extends BlockBase {
  type: "attachment_reference";
  file_id?: string | null;
  filename: string;
  title: string;
}

export interface LegacyHtmlBlock extends BlockBase {
  type: "legacy_html";
  content: string;
  rich?: boolean;
}

export interface PdfReferenceBlock extends BlockBase {
  type: "pdf_reference";
  src: string;
  page_count: number;
  mode: string;
}

export interface ArticleBlock extends BlockBase {
  type: "article";
  number?: string | null;
  suffix?: string | null;
  caput: string;
  paragraphs: ParagraphItemBlock[];
  incisos: IncisoBlock[];
  alineas: AlineaBlock[];
  items: string[];
  rich?: boolean;
}

export type SemanticBlock =
  | HeadingBlock
  | PreambleBlock
  | CommandBlock
  | ParagraphBlock
  | ParagraphItemBlock
  | IncisoBlock
  | AlineaBlock
  | ListBlock
  | TableBlock
  | ImageBlock
  | QuoteBlock
  | PageBreakBlock
  | SignatureBlock
  | AttachmentReferenceBlock
  | LegacyHtmlBlock
  | PdfReferenceBlock
  | ArticleBlock;

export interface SemanticDocument {
  schema_version: number;
  document_id: string;
  document_type: string;
  title: string;
  summary: string;
  locale: string;
  timezone: string;
  template_id?: string | null;
  template_version?: string | null;
  source_type: string;
  source_hash?: string | null;
  text_integrity_hash?: string | null;
  classification_status: string;
  blocks: SemanticBlock[];
  created_at?: string | null;
  updated_at?: string | null;
}

export interface IntegrityIssue {
  level: "error" | "warning" | "info";
  code: string;
  message: string;
  location?: string;
  expected?: string;
  actual?: string;
}

export interface IntegrityReport {
  valid: boolean;
  changed_words: string[];
  lost_words: string[];
  monetary_changes: string[];
  date_changes: string[];
  total_changed: number;
  issues: IntegrityIssue[];
  message?: string;
}

export interface ValidationIssue {
  code: string;
  message: string;
  block_id?: string;
  severity: "error" | "warning";
}

export interface ValidationReport {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export interface SemanticAnalyzeResponse {
  document: SemanticDocument;
  source_hash: string;
  text_integrity_hash: string;
  integrity: IntegrityReport;
  validation: ValidationReport;
}

export interface SemanticSaveResponse {
  document: SemanticDocument;
  text_integrity_hash: string;
  classification_status: string;
  validation: ValidationReport;
}

export interface TemplateVersionOut {
  id: string;
  version_number: number;
  status: string;
  config_hash: string;
  change_reason?: string | null;
  created_by?: string | null;
  created_at: string;
}

export interface Template {
  id: string;
  name: string;
  slug: string;
  document_type: string;
  is_default: boolean;
  status: string;
  active_version?: number | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  versions: TemplateVersionOut[];
}

/** TemplateConfig token shape (mirrors app/semantic/templates.py). */
export interface TemplateConfig {
  tokens: Record<string, string | number>;
  allowed_blocks: SemanticBlockType[];
  required_sections: string[];
  recommended_order: SemanticBlockType[];
}

export const SEMANTIC_BLOCK_LABELS: Record<SemanticBlockType, string> = {
  heading: "Título",
  preamble: "Preâmbulo",
  command: "Comando (DECRETA/RESOLVE)",
  paragraph: "Parágrafo",
  article: "Artigo",
  paragraph_item: "Parágrafo de artigo (§)",
  inciso: "Inciso (I, II…)",
  alinea: "Alínea (a, b…)",
  list: "Lista",
  table: "Tabela",
  image: "Imagem",
  quote: "Citação",
  page_break: "Quebra de página",
  signature_block: "Bloco de autoridade",
  attachment_reference: "Referência de anexo",
  legacy_html: "HTML legado",
  pdf_reference: "PDF original",
};

export const SEMANTIC_BLOCK_ORDER: SemanticBlockType[] = [
  "heading",
  "preamble",
  "command",
  "paragraph",
  "article",
  "paragraph_item",
  "inciso",
  "alinea",
  "list",
  "table",
  "image",
  "quote",
  "signature_block",
  "attachment_reference",
  "page_break",
  "legacy_html",
  "pdf_reference",
];
