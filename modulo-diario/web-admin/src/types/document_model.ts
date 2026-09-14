// Tipos espelhando os schemas do backend para modelos documentais e IA.

export interface DocumentModelSummary {
  id: string;
  slug: string;
  name: string;
  purpose: string;
  document_type: string;
  status: string;
  is_default: boolean;
  active_version: number | null;
  parent_model_id?: string | null;
  created_by?: string | null;
  created_by_name?: string | null;
  usage_count: number;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface DocumentModelHistoryEntry {
  id: string;
  action: string;
  description?: string | null;
  user_id?: string | null;
  user_name?: string | null;
  created_at?: string | null;
}

export interface VersionSummary {
  version_number: number;
  status: string;
  config_hash: string;
  change_reason?: string | null;
  created_at?: string | null;
}

export interface DocumentModelDetail extends DocumentModelSummary {
  description: string;
  versions: VersionSummary[];
}

// ── Modelo semântico (config validada no servidor) ────────────────────────

export type DocumentFieldType =
  | "text"
  | "date"
  | "integer"
  | "decimal"
  | "money"
  | "select"
  | "reference";

export interface DocumentFieldCondition {
  field: string;
  value: string;
}

export interface DocumentField {
  key: string;
  label: string;
  type: DocumentFieldType;
  required?: boolean;
  options?: string[];
  help?: string;
  min_value?: number | null;
  max_value?: number | null;
  regex?: string | null;
  required_when?: DocumentFieldCondition[];
}

export type DocumentSectionKind =
  | "heading"
  | "preamble"
  | "command"
  | "paragraph"
  | "article"
  | "paragraph_item"
  | "inciso"
  | "alinea"
  | "quote"
  | "signature_block"
  | "attachment_reference";

export interface SignatureEntry {
  name?: string;
  role?: string;
  organ?: string;
  location?: string;
  date?: string;
  authority_id?: string | null;
  credential_id?: string | null;
  position?: "left" | "center" | "right";
}

export interface DocumentSection {
  id: string;
  kind: DocumentSectionKind;
  text?: string;
  number?: string | null;
  suffix?: string | null;
  level?: number;
  alignment?: string;
  when_field?: string | null;
  when_value?: string | null;
  fixed_text?: boolean;
  locked?: boolean;
  ai_generated?: boolean;
  entries?: SignatureEntry[];
  children?: DocumentSection[];
}

export interface DocumentModelConfig {
  purpose: string;
  description?: string;
  scope_document_type: string;
  document_title?: string;
  summary?: string;
  fields: DocumentField[];
  sections: DocumentSection[];
}

// ── Modelo visual (layout A4) ─────────────────────────────────────────────

export interface DocumentLayoutMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface DocumentLayoutFont {
  family: string;
  size: number;
  line_height: number;
  color: string;
}

export interface DocumentLayoutHeader {
  enabled?: boolean;
  show_coat_of_arms?: boolean;
  show_institution_name?: boolean;
  show_address?: boolean;
  show_cnpj?: boolean;
  show_phone?: boolean;
  show_site?: boolean;
  custom_html?: string;
  alignment?: string;
}

export interface DocumentLayoutFooter {
  enabled?: boolean;
  show_page_numbers?: boolean;
  page_number_format?: string;
  custom_html?: string;
  alignment?: string;
}

export interface DocumentLayout {
  page_size?: string;
  orientation?: string;
  margins?: DocumentLayoutMargins;
  body_font?: DocumentLayoutFont;
  heading_font?: DocumentLayoutFont | null;
  header?: DocumentLayoutHeader;
  footer?: DocumentLayoutFooter;
  show_coat_of_arms?: boolean;
  coat_of_arms_url?: string | null;
  background_color?: string;
  accent_color?: string;
}

export interface VersionDetail extends VersionSummary {
  config: DocumentModelConfig;
  layout?: DocumentLayout | null;
}

// ── Biblioteca de blocos reutilizáveis ────────────────────────────────────

export interface DocumentModelBlockContent {
  sections?: DocumentSection[];
  [key: string]: unknown;
}

export interface DocumentModelBlock {
  id: string;
  name: string;
  kind: string;
  description?: string | null;
  content_json: DocumentModelBlockContent;
  is_active: boolean;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface InstitutionalProfile {
  name: string;
  slug: string;
  cnpj?: string | null;
  state?: string | null;
  address_street?: string | null;
  address_number?: string | null;
  address_complement?: string | null;
  address_district?: string | null;
  address_city?: string | null;
  address_postal_code?: string | null;
  phone?: string | null;
  email?: string | null;
  site?: string | null;
  logo_url?: string | null;
  institutional_layout?: DocumentLayout | null;
}

// ── Aprender com documentos (Fase 4) ───────────────────────────────────────

export interface TrainingFile {
  id: string;
  filename: string;
  mime_type?: string | null;
  size_bytes?: number | null;
  status: string;
  used_by_ai: boolean;
  has_text: boolean;
  created_at?: string | null;
}

export interface LearnProposal {
  ok: boolean;
  status: string;
  message?: string | null;
  prompt_version: string;
  config?: DocumentModelConfig | null;
  sources: string[];
}

export interface PreviewResult {
  complete: boolean;
  pending: { code: string; message: string; field?: string | null }[];
  document: Record<string, unknown>;
  canonical_text: string;
  free_text: string[];
}

export interface AiExtractResult {
  matched_model: DocumentModelSummary | null;
  ambiguity: boolean;
  candidates: DocumentModelSummary[];
  values: Record<string, string>;
  pending: { code: string; message: string; field?: string | null }[];
  complete: boolean;
  prompt_version: string;
  note?: string | null;
}

export interface MaterialCreated {
  id: string;
  title: string;
  status: string;
  act_number: string | null;
  act_year: number | null;
  document_type: string;
}

export interface NumberIssue {
  matter_id: string;
  number: number;
  year: number;
  already_assigned: boolean;
}

// ── Atos por tipo (listagem) ──────────────────────────────────────────────
export interface DocumentMaterialRow {
  id: string;
  title: string;
  summary?: string | null;
  document_type: string | null;
  editorial_status: string;
  signature_status: string;
  publication_status: string;
  act_number: string | null;
  act_year: number | null;
  act_date?: string | null;
  editions: {
    edition_id: string;
    number: number | null;
    year: number | null;
    status: string;
  }[];
  created_at?: string | null;
  updated_at?: string | null;
}

export interface MaterialsResult {
  items: DocumentMaterialRow[];
  total: number;
  page: number;
  limit: number;
}

// ── IA (Configurações → Inteligência artificial) ──────────────────────────
export interface AiConfigMetadata {
  enabled: boolean;
  provider: string;
  model: string;
  endpoint: string;
  configured: boolean;
  key_masked: string | null;
  limits: {
    timeout_seconds: number;
    max_tokens: number;
    max_concurrency: number;
    monthly_token_limit: number | null;
  };
  usage: { tokens: number; monthly_token_limit: number | null };
  last_test: {
    status: string | null;
    at: string | null;
    message: string | null;
    latency_ms: number | null;
  };
  created_at?: string | null;
  updated_at?: string | null;
}

export interface AiTestResult {
  ok: boolean;
  status: string;
  message?: string | null;
  latency_ms?: number | null;
  usage?: Record<string, unknown>;
  note?: string | null;
}
