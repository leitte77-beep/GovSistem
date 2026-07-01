/**
 * Token storage policy:
 * - access_token: stored in sessionStorage (cleared on tab close, reduces XSS persistence window)
 * - refresh_token: stored in localStorage (needed for cross-tab refresh; acceptable
 *   risk because refresh tokens are short-lived and can be revoked server-side)
 *
 * TODO: Migrate to httpOnly cookies + CSRF tokens for defense-in-depth.
 * This requires backend changes to set cookies on /auth/login, /auth/refresh, etc.
 */
import type {
  ActType,
  ApiError,
  Attachment,
  AuditEvent,
  Matter,
  MatterListItem,
  OrgUnit,
} from "@/types/matter";
import type { User, UserCreateRequest, UserUpdateRequest } from "@/types/user";
import type { SystemSetting } from "@/types/setting";

const BASE_URL = "/api/v1";

class AuthError extends Error {
  constructor() {
    super("Not authenticated");
    this.name = "AuthError";
  }
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  bootstrapTokenFromQuery();
  return sessionStorage.getItem("access_token");
}

export function bootstrapTokenFromQuery(): string | null {
  if (typeof window === "undefined") return null;
  const urlParams = new URLSearchParams(window.location.search);
  const urlToken = urlParams.get("token");
  if (urlToken) {
    sessionStorage.setItem("access_token", urlToken);
    window.history.replaceState({}, "", window.location.pathname);
    return urlToken;
  }
  return null;
}

function getHeaders(isFormData = false): Record<string, string> {
  const headers: Record<string, string> = {};
  if (!isFormData) headers["Content-Type"] = "application/json";
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

function mergeHeaders(
  base: Record<string, string>,
  extra: HeadersInit | undefined
): Record<string, string> {
  if (!extra) return base;
  if (Array.isArray(extra)) {
    for (const [k, v] of extra) base[k] = v;
  } else if (extra instanceof Headers) {
    extra.forEach((v, k) => { base[k] = v; });
  } else {
    for (const [k, v] of Object.entries(extra)) base[k] = v;
  }
  return base;
}

let refreshPromise: Promise<boolean> | null = null;

async function tryRefreshToken(): Promise<boolean> {
  const refreshToken = localStorage.getItem("refresh_token");
  if (!refreshToken) return false;

  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${BASE_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!res.ok) {
        sessionStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        window.dispatchEvent(new Event("auth:logout"));
        return false;
      }
      const data = await res.json();
      sessionStorage.setItem("access_token", data.access_token);
      localStorage.setItem("refresh_token", data.refresh_token);
      return true;
    } catch {
      sessionStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      window.dispatchEvent(new Event("auth:logout"));
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  retry = true
): Promise<T> {
  const isFormData = options.body instanceof FormData;
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { ...getHeaders(isFormData), ...mergeHeaders({}, options.headers) },
  });
  if (res.status === 401 && retry) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      return request<T>(path, options, false);
    }
    throw new AuthError();
  }
  if (res.status === 401) throw new AuthError();
  if (!res.ok) {
    const err: ApiError = await res.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  if (res.status === 204) return null as T;
  return res.json();
}

export interface BackupFile {
  filename: string;
  size_bytes: number;
  created_at: string;
}

export const api = {
  // Auth
  login(email: string, password: string) {
    return request<{ access_token: string; refresh_token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },

  refresh(refresh_token: string) {
    return request<{ access_token: string; refresh_token: string }>("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refresh_token }),
    });
  },

  me() {
    return request<{
      id: string;
      email: string;
      name: string;
      roles: { id: string; name: string; label: string }[];
      organization_id: string;
    }>("/auth/me");
  },

  listOrganizations() {
    return request<{ id: string; name: string; slug: string; is_active: boolean }[]>("/auth/organizations");
  },

  switchOrganization(organization_id: string) {
    return request<{ access_token: string; refresh_token: string }>("/auth/switch-organization", {
      method: "POST",
      body: JSON.stringify({ organization_id }),
    });
  },

  // Matters
  listMatters(params?: {
    status?: string;
    search?: string;
    skip?: number;
    limit?: number;
  }) {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.search) q.set("search", params.search);
    if (params?.skip) q.set("skip", String(params.skip));
    if (params?.limit) q.set("limit", String(params.limit));
    const qs = q.toString();
    return request<MatterListItem[]>(`/matters${qs ? `?${qs}` : ""}`);
  },

  getMatter(id: string) {
    return request<Matter>(`/matters/${id}`);
  },

  archiveMatter(id: string) {
    return request<{ status: string }>(`/matters/${id}/archive`, { method: "POST" });
  },

  deleteMatter(id: string) {
    return request<void>(`/matters/${id}`, { method: "DELETE" });
  },

  getNextMatterTitle(actTypeId: string) {
    const q = new URLSearchParams({ act_type_id: actTypeId });
    return request<{ title: string; next_number: number; last_number: number }>(
      `/matters/next-title?${q.toString()}`
    );
  },

  createMatter(data: {
    title: string;
    summary?: string;
    act_type_id: string;
    org_unit_id?: string;
    content_html: string;
    content_json?: Record<string, unknown>;
  }) {
    return request<Matter>("/matters", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  updateMatter(id: string, data: Partial<{
    title: string;
    summary: string;
    act_type_id: string;
    org_unit_id: string;
    content_html: string;
    content_json: Record<string, unknown>;
  }>) {
    return request<Matter>(`/matters/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  submitReview(id: string) {
    return request<Matter>(`/matters/${id}/submit-review`, { method: "POST" });
  },

  approve(id: string) {
    return request<Matter>(`/matters/${id}/approve`, { method: "POST" });
  },

  reject(id: string) {
    return request<Matter>(`/matters/${id}/reject`, { method: "POST" });
  },

  // Attachments
  uploadAttachment(matterId: string, file: File) {
    const fd = new FormData();
    fd.append("file", file);
    return request<Attachment>(`/matters/${matterId}/attachments`, {
      method: "POST",
      body: fd,
    });
  },

  uploadContentPdf(matterId: string, file: File) {
    const fd = new FormData();
    fd.append("file", file);
    return request<Matter>(`/matters/${matterId}/content-pdf`, {
      method: "POST",
      body: fd,
    });
  },

  formatContentWithAI(data: { content: string; act_type?: string; title?: string; summary?: string }) {
    return request<{ structured_html: string; model: string; notes: string[] }>("/ai/format-content", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  deleteAttachment(matterId: string, attachmentId: string) {
    return request<void>(`/matters/${matterId}/attachments/${attachmentId}`, {
      method: "DELETE",
    });
  },

  // Act types
  listActTypes() {
    return request<ActType[]>("/act-types");
  },

  // Org units
  listOrgUnits() {
    return request<OrgUnit[]>("/org-units");
  },

  // Audit
  listMatterAudit(matterId: string) {
    return request<AuditEvent[]>(`/matters/${matterId}/audit`);
  },

  // Editions
  listEditions(params?: { year?: number; status?: string }) {
    const q = new URLSearchParams();
    if (params?.year) q.set("year", String(params.year));
    if (params?.status) q.set("status", params.status);
    const qs = q.toString();
    return request<import("../types/edition").EditionListItem[]>(`/editions${qs ? `?${qs}` : ""}`);
  },

  getEdition(id: string) {
    return request<import("../types/edition").Edition>(`/editions/${id}`);
  },

  createEdition(data: {
    number: number; year: number; type: string;
    title: string; subtitle?: string; publication_date: string;
  }) {
    return request<import("../types/edition").Edition>("/editions", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  updateEdition(id: string, data: Partial<{ title: string; subtitle: string; publication_date: string }>) {
    return request<import("../types/edition").Edition>(`/editions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  addEditionItem(editionId: string, matterId: string, sectionTitle?: string) {
    return request<import("../types/edition").Edition>(`/editions/${editionId}/items`, {
      method: "POST",
      body: JSON.stringify({ matter_id: matterId, section_title: sectionTitle }),
    });
  },

  reorderEditionItems(editionId: string, items: { id: string; position: number }[]) {
    return request<import("../types/edition").EditionItem[]>(`/editions/${editionId}/items/reorder`, {
      method: "PATCH",
      body: JSON.stringify({ items }),
    });
  },

  removeEditionItem(editionId: string, itemId: string) {
    return request<void>(`/editions/${editionId}/items/${itemId}`, { method: "DELETE" });
  },

  closeEdition(id: string) {
    return request<import("../types/edition").Edition>(`/editions/${id}/close`, { method: "POST" });
  },

  deleteEdition(id: string) {
    return request<void>(`/editions/${id}`, { method: "DELETE" });
  },

  reopenEdition(id: string) {
    return request<import("../types/edition").Edition>(`/editions/${id}/reopen`, { method: "POST" });
  },

  generatePdf(id: string) {
    return request<import("../types/edition").Edition>(`/editions/${id}/generate-pdf`, { method: "POST" });
  },

  signEdition(id: string, data: { signing_credential_id?: string; pfx_base64?: string; pfx_password?: string; reason?: string; location?: string }) {
    return request<{ verification_code: string; signed_pdf_hash: string; certificate_subject: string; certificate_serial: string; signed_at: string }>(`/editions/${id}/sign`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  publishEdition(id: string) {
    return request<import("../types/edition").Edition>(`/editions/${id}/publish`, { method: "POST" });
  },

  // Users
  listUsers() {
    return request<User[]>("/users");
  },

  getUser(id: string) {
    return request<User>(`/users/${id}`);
  },

  createUser(data: UserCreateRequest) {
    return request<User>("/users", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  updateUser(id: string, data: UserUpdateRequest) {
    return request<User>(`/users/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  deleteUser(id: string) {
    return request<void>(`/users/${id}`, { method: "DELETE" });
  },

  listRoles() {
    return request<import("@/types/user").Role[]>("/roles");
  },

  // System Settings
  listSettings(category?: string) {
    const qs = category ? `?category=${category}` : "";
    return request<SystemSetting[]>(`/settings${qs}`);
  },

  getSetting(id: string) {
    return request<SystemSetting>(`/settings/${id}`);
  },

  updateSetting(id: string, data: { value?: string; description?: string }) {
    return request<SystemSetting>(`/settings/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  // PDF Layout
  listPdfLayouts() {
    return request<{ layouts: { id: string; name: string; description: string }[] }>("/settings/pdf-layouts");
  },

  getOrgPdfLayout() {
    return request<{ layout: string; available: string[] }>("/settings/organization/pdf-layout");
  },

  updateOrgPdfLayout(layout: string) {
    return request<{ layout: string; message: string }>("/settings/organization/pdf-layout", {
      method: "PATCH",
      body: JSON.stringify({ layout }),
    });
  },

  // Signing Credentials
  listSigningCredentials() {
    return request<any[]>("/signing-credentials");
  },

  uploadSigningCredential(formData: FormData) {
    return request<any>("/signing-credentials", {
      method: "POST",
      body: formData,
    });
  },

  deleteSigningCredential(id: string) {
    return request<void>(`/signing-credentials/${id}`, { method: "DELETE" });
  },

  // Backup
  createBackup() {
    return request<{ filename: string; size_bytes: number; created_at: string; message: string }>("/backup", {
      method: "POST",
    });
  },

  downloadBackupUrl(filename: string) {
    return `${BASE_URL}/backup/download/${filename}`;
  },

  listBackups() {
    return request<BackupFile[]>("/backup/files");
  },

  deleteBackup(filename: string) {
    return request<void>(`/backup/files/${encodeURIComponent(filename)}`, {
      method: "DELETE",
    });
  },

  restoreBackup(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    return request<{ message: string }>("/backup/restore", {
      method: "POST",
      body: fd,
    });
  },

  restoreBackupFromServer(filename: string) {
    return request<{ message: string }>(`/backup/restore/${encodeURIComponent(filename)}`, {
      method: "POST",
    });
  },

  // Generic request (for operations dashboard)
  getRaw<T = any>(path: string) {
    return request<T>(path);
  },

  patch<T = any>(path: string, body?: any) {
    return request<T>(path, {
      method: "PATCH",
      body: body ? JSON.stringify(body) : undefined,
    });
  },
};

export { AuthError };
