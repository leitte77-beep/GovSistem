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
