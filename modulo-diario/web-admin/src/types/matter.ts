export type MatterStatus =
  | "draft"
  | "review"
  | "approved"
  | "published"
  | "archived"
  | "rejected";

export interface MatterListItem {
  id: string;
  title: string;
  summary: string | null;
  act_type_id: string;
  org_unit_id: string | null;
  status: MatterStatus;
  version: number;
  author_id: string;
  reviewed_by: string | null;
  created_at: string;
  updated_at: string;
  attachment_count: number;
}

export interface Attachment {
  id: string;
  file_id: string;
  title: string | null;
  type: string;
  position: number;
}

export interface Matter {
  id: string;
  title: string;
  summary: string | null;
  act_type_id: string;
  org_unit_id: string | null;
  content_html: string;
  content_json: Record<string, unknown> | null;
  content_mode: "rich_text" | "pdf" | "semantic" | "legacy_html" | "original_pdf";
  plain_text: string;
  status: MatterStatus;
  version: number;
  author_id: string;
  reviewed_by: string | null;
  published_at: string | null;
  is_erratum: boolean;
  act_number: string | null;
  act_year: number | null;
  act_date: string | null;
  responsible_name: string | null;
  responsible_role: string | null;
  responsible_id?: string | null;
  metadata?: Record<string, unknown> | null;
  review_reason?: string | null;
  publication_type: string;
  references_matter_id: string | null;
  created_at: string;
  updated_at: string;
  attachments: Attachment[];
}

export type DynamicFieldType =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "currency"
  | "cpf_cnpj"
  | "select"
  | "boolean";

export interface DynamicFieldDef {
  key: string;
  label: string;
  type: DynamicFieldType;
  required: boolean;
  placeholder?: string | null;
  help?: string | null;
  options?: string[];
}

export interface ActTypeConfig {
  number_required?: boolean;
  year_required?: boolean;
  date_required?: boolean;
  responsible_required?: boolean;
  allow_free_responsible?: boolean;
  title_pattern?: string | null;
  title_uppercase?: boolean;
  dynamic_fields?: DynamicFieldDef[];
}

export interface ActType {
  id: string;
  name: string;
  description: string | null;
  config?: ActTypeConfig | null;
}

export interface ActTypeAdmin extends ActType {
  is_active: boolean;
}

export interface Authority {
  id: string;
  name: string;
  role: string | null;
  org_unit_id: string | null;
  org_unit_name?: string | null;
  is_active: boolean;
  valid_from: string | null;
  valid_until: string | null;
  notes?: string | null;
  created_at?: string | null;
}

export interface OrgUnit {
  id: string;
  name: string;
  abbreviation: string | null;
  parent_id?: string | null;
  parent_name?: string | null;
}

export interface AuditEvent {
  id: string;
  action: string;
  description: string | null;
  created_at: string;
  extra_metadata: Record<string, unknown> | null;
}

export interface ApiError {
  detail: string;
}
