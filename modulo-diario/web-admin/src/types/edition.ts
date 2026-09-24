export type EditionStatus = "draft" | "reviewing" | "scheduled" | "closed" | "pdf_generated" | "signed" | "published" | "cancelled";
export type EditionType = "normal" | "extra" | "suplementar";

export interface EditionItem {
  id: string;
  matter_id: string;
  matter_title: string;
  section_title: string | null;
  position: number;
  page_number: number | null;
}

export interface Edition {
  id: string;
  number: number;
  year: number;
  type: EditionType;
  title: string;
  subtitle: string | null;
  publication_date: string;
  status: EditionStatus;
  created_by: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  items: EditionItem[];
  item_count: number;
}

export interface EditionListItem {
  id: string;
  number: number;
  year: number;
  type: EditionType;
  title: string;
  status: EditionStatus;
  publication_date: string;
  published_at: string | null;
  created_at: string;
  item_count: number;
  signature_count: number;
}

export interface MatterListItem {
  id: string;
  title: string;
  status: string;
  act_type_id: string;
  summary: string | null;
  created_at: string;
}

export interface PublicationQueueItem {
  matter_id: string;
  title: string;
  summary: string | null;
  act_number: string | null;
  act_year: number | null;
  act_date: string | null;
  act_type_id: string;
  act_type_name: string | null;
  org_unit_id: string | null;
  org_unit_name: string | null;
  suggested_section: string;
  target_date: string | null;
}

export interface PublicationQueue {
  total: number;
  items: PublicationQueueItem[];
}

export interface EditionValidationCheck {
  code: string;
  label: string;
  status: "ok" | "warning" | "error";
  detail: string;
}

export interface EditionValidation {
  ok: boolean;
  checks: EditionValidationCheck[];
  edition_id: string;
  status: string;
  pdf_available: boolean;
  preview_available: boolean;
}

export type PublicationGate = EditionValidation;

export interface EditionInspectionReport {
  ok: boolean;
  errors: { code: string; severity: string; message: string }[];
  warnings: { code: string; severity: string; message: string }[];
  page_count: number;
  page_sizes: string[];
  page_number_by_anchor: Record<string, number>;
  missing_anchors: string[];
  unexpected_anchors: string[];
  fonts_not_embedded: string[];
  has_signature: boolean;
  signature_count: number;
  metadata: Record<string, string | null>;
}

export interface MatterAnalysisSuggestion {
  act_type_name: string | null;
  act_number: string | null;
  act_year: number | null;
  title: string | null;
  summary: string | null;
  summary_label: string | null;
  confidence: number;
}

export interface MatterAnalysis {
  document: {
    blocks: { type: string; text?: string }[];
    title: string;
    summary: string;
    summary_label: string | null;
  };
  suggestions: MatterAnalysisSuggestion;
  validation: { valid: boolean; errors?: unknown[] };
  integrity: Record<string, unknown>;
}
