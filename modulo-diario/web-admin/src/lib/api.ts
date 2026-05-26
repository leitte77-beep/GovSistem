const BASE = "/api/v1";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  const urlParams = new URLSearchParams(window.location.search);
  const urlToken = urlParams.get("token");
  if (urlToken) {
    localStorage.setItem("diario_token", urlToken);
    window.history.replaceState({}, "", window.location.pathname);
    return urlToken;
  }
  return localStorage.getItem("diario_token");
}

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method: opts.method || "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  if (res.status === 204) return undefined as T;
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(err.detail || "Request failed");
  }
  return res.json();
}

export function setToken(token: string) { localStorage.setItem("diario_token", token); }
export function clearToken() { localStorage.removeItem("diario_token"); }
export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("diario_token");
}
export { getToken };
export default api;
