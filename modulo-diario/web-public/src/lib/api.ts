const BASE = (process.env.NEXT_PUBLIC_API_URL || "/api/v1").replace(/\/api\/v1$/, "");

function getTenantSlug(): string | null {
  if (typeof window === "undefined") return null;
  const hostname = window.location.hostname.toLowerCase();
  const suffix = ".govsistem.com.br";
  if (hostname.endsWith(suffix)) {
    const subdomain = hostname.slice(0, -suffix.length);
    if (subdomain && !subdomain.includes(".") && /^[a-z0-9][a-z0-9-]{1,62}$/.test(subdomain)) {
      return subdomain;
    }
  }
  const first = window.location.pathname.split("/").filter(Boolean)[0];
  if (first && /^[a-z0-9][a-z0-9-]{1,62}$/.test(first)) return first;
  const match = document.cookie.match(/(?:^|;\s*)tenant_slug=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function get<T>(path: string): Promise<T> {
  const tenantSlug = getTenantSlug();
  const headers: HeadersInit = tenantSlug ? { "X-Tenant-Slug": tenantSlug } : {};
  const res = await fetch(`${BASE}${path}`, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** POST que devolve a mensagem de erro da API (ex.: "Informe um e-mail válido."). */
async function post<T>(path: string, body: unknown): Promise<T> {
  const tenantSlug = getTenantSlug();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (tenantSlug) headers["X-Tenant-Slug"] = tenantSlug;
  const res = await fetch(`${BASE}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = typeof data?.detail === "string" ? data.detail : null;
    throw new Error(detail || (res.status === 429 ? "Muitas tentativas. Aguarde um minuto." : "Não foi possível concluir. Tente novamente."));
  }
  return data as T;
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
  slug: string | null;
  title: string;
  summary: string | null;
  act_type: string;
  org_unit: string;
  edition_number: string | null;
  publication_date: string | null;
  pdf_url: string | null;
}

export interface EditionListParams {
  year?: number;
  month?: number;
  type?: string;
  search?: string;
  number?: number;
  act?: string;
  date_from?: string;
  date_to?: string;
  order?: "asc" | "desc";
  page?: number;
  page_size?: number;
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

export interface OrganizationContact {
  email: string | null;
  phone: string | null;
  site: string | null;
  address_street: string | null;
  address_number: string | null;
  address_complement: string | null;
  address_district: string | null;
  address_city: string | null;
  state: string | null;
  address_postal_code: string | null;
}

export interface OrganizationInfo {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  description: string | null;
  contact?: OrganizationContact | null;
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
  listEditions(params?: EditionListParams): Promise<EditionListResponse> {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params ?? {})) {
      if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
    }
    const qs = q.toString();
    return get<EditionListResponse>(`/api/public/v1/editions${qs ? `?${qs}` : ""}`);
  },

  listEditionActFilters(): Promise<{ key: string; label: string; count: number }[]> {
    return get<{ key: string; label: string; count: number }[]>("/api/public/v1/editions/act-filters");
  },

  listEditionYears(): Promise<{ year: number; count: number }[]> {
    return get<{ year: number; count: number }[]>("/api/public/v1/editions/years");
  },

  getEdition(year: number, number: number, type?: string) {
    const q = type ? `?type=${encodeURIComponent(type)}` : "";
    return get<any>(`/api/public/v1/editions/by-year/${year}/${number}${q}`);
  },

  getEditionSnapshot(year: number, number: number) {
    return get<any>(`/api/public/v1/editions/${year}/${number}/snapshot`);
  },

  editionDownloadUrl(year: number, number: number, inline = false) {
    return `${BASE}/api/public/v1/editions/${year}/${number}/download${inline ? "?inline=1" : ""}`;
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

  newsletterSubscribe(email: string): Promise<{ status: string; message: string }> {
    return post("/api/public/v1/newsletter/subscribe", { email });
  },

  newsletterConfirm(token: string): Promise<{ status: string; email: string }> {
    return post("/api/public/v1/newsletter/confirm", { token });
  },

  newsletterUnsubscribe(token: string): Promise<{ status: string; email: string }> {
    return post("/api/public/v1/newsletter/unsubscribe", { token });
  },

  portalVisits(): Promise<{ visits: number }> {
    return get("/api/public/v1/stats");
  },

  registerPortalVisit(): Promise<{ visits: number }> {
    return post("/api/public/v1/stats/visit", {});
  },

  editionViews(editionId: string): Promise<{ views: number }> {
    return get(`/api/public/v1/edition-views/${editionId}`);
  },

  registerEditionView(editionId: string): Promise<{ views: number }> {
    return post(`/api/public/v1/edition-views/${editionId}`, {});
  },

  getOrganization(): Promise<OrganizationInfo> {
    return get<OrganizationInfo>("/api/public/v1/organization");
  },

  verify(code: string): Promise<VerifyResult> {
    return get<VerifyResult>(`/api/public/v1/verify/${code}`);
  },
};
