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
  plain_text: string;
  status: MatterStatus;
  version: number;
  author_id: string;
  reviewed_by: string | null;
  published_at: string | null;
  is_erratum: boolean;
  created_at: string;
  updated_at: string;
  attachments: Attachment[];
}

export interface ActType {
  id: string;
  name: string;
  description: string | null;
}

export interface OrgUnit {
  id: string;
  name: string;
  abbreviation: string | null;
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
