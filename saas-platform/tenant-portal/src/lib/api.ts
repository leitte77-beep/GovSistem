const BASE = "/api/v1";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("tenant_access_token");
}

function formatDetail(detail: unknown): string {
  if (typeof detail === "string" && detail) return detail;
  if (Array.isArray(detail)) {
    const msgs = detail.map((d) => (typeof d === "string" ? d : d?.msg)).filter(Boolean);
    if (msgs.length) return msgs.join(". ");
  }
  if (detail && typeof detail === "object") {
    const msg = (detail as { msg?: string; message?: string }).msg ?? (detail as { message?: string }).message;
    if (msg) return msg;
  }
  return "Request failed";
}

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; headers?: Record<string, string> } = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { ...opts.headers };
  if (!(opts.body instanceof FormData)) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method: opts.method || "GET",
    headers,
    body: opts.body instanceof FormData ? opts.body : opts.body ? JSON.stringify(opts.body) : undefined,
  });

  if (res.status === 204) return undefined as T;
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(formatDetail(err.detail));
  }
  return res.json();
}

export function setToken(token: string) { localStorage.setItem("tenant_access_token", token); }
export function clearToken() { localStorage.removeItem("tenant_access_token"); }
export function getStoredToken(): string | null { return getToken(); }
export default api;
