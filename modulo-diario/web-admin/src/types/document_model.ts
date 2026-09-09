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
  updated_at?: string | null;
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

export interface VersionDetail extends VersionSummary {
  config: Record<string, unknown>;
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
