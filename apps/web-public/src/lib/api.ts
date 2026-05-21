const BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001/api/v1").replace(/\/api\/v1$/, "");

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { next: { revalidate: 60 } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export interface EditionSummary {
  id: string;
  number: number;
  year: number;
  type: string;
  title: string;
  subtitle: string | null;
  daily_summary: string | null;
  publication_date: string;
  verification_code: string | null;
  item_count: number;
  signature_count: number;
  pdf_url: string | null;
}

export interface MatterSummary {
  id: string;
  title: string;
  summary: string | null;
  act_type: string;
  org_unit: string;
  edition_number: string | null;
  publication_date: string | null;
  pdf_url: string | null;
}

export interface PaginationMeta {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
  next_url: string | null;
  prev_url: string | null;
}

export interface EditionListResponse {
  data: EditionSummary[];
  pagination: PaginationMeta;
}

export interface MatterListResponse {
  data: MatterSummary[];
  pagination: PaginationMeta;
}

export interface OrganizationInfo {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  description: string | null;
  theme: {
    primary_color: string;
    secondary_color: string;
    font_family: string;
  };
}

export interface VerifyResult {
  valid: boolean;
  edition_id: string | null;
  edition_title: string | null;
  edition_number: number | null;
  edition_year: number | null;
  publication_date: string | null;
  pdf_hash: string | null;
  immutability_hash: string | null;
  certificate_subject: string | null;
  certificate_name: string | null;
  certificate_document: string | null;
  signed_at: string | null;
  verification_url: string | null;
  message: string;
}

export const api = {
  listEditions(params?: { year?: number; type?: string; search?: string; page?: number; page_size?: number }): Promise<EditionListResponse> {
    const q = new URLSearchParams();
    if (params?.year) q.set("year", String(params.year));
    if (params?.type) q.set("type", params.type);
    if (params?.search) q.set("search", params.search);
    if (params?.page !== undefined) q.set("page", String(params.page));
    if (params?.page_size !== undefined) q.set("page_size", String(params.page_size));
    const qs = q.toString();
    return get<EditionListResponse>(`/api/public/v1/editions${qs ? `?${qs}` : ""}`);
  },

  getEdition(year: number, number: number) {
    return get<any>(`/api/public/v1/editions/by-year/${year}/${number}`);
  },

  getMatter(id: string) {
    return get<any>(`/api/public/v1/matters/${id}`);
  },

  search(params?: { q?: string; act_type?: string; org_unit?: string; year?: number; date_from?: string; date_to?: string; edition?: number; page?: number; page_size?: number }): Promise<MatterListResponse> {
    const p = new URLSearchParams();
    if (params?.q) p.set("q", params.q);
    if (params?.act_type) p.set("act_type", params.act_type);
    if (params?.org_unit) p.set("org_unit", params.org_unit);
    if (params?.year !== undefined) p.set("year", String(params.year));
    if (params?.date_from) p.set("date_from", params.date_from);
    if (params?.date_to) p.set("date_to", params.date_to);
    if (params?.edition !== undefined) p.set("edition", String(params.edition));
    if (params?.page !== undefined) p.set("page", String(params.page));
    if (params?.page_size !== undefined) p.set("page_size", String(params.page_size));
    return get<MatterListResponse>(`/api/public/v1/matters${p.toString() ? `?${p.toString()}` : ""}`);
  },

  getOrganization(): Promise<OrganizationInfo> {
    return get<OrganizationInfo>("/api/public/v1/organization");
  },

  verify(code: string): Promise<VerifyResult> {
    return get<VerifyResult>(`/api/public/v1/verify/${code}`);
  },
};
