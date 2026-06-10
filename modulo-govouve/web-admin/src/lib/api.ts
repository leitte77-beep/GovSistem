const BASE_URL = "/api/govouve";
const ACCESS_TOKEN_KEY = "govouve_access_token";
const REFRESH_TOKEN_KEY = "govouve_refresh_token";

class AuthError extends Error {
  constructor() {
    super("Not authenticated");
    this.name = "AuthError";
  }
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  bootstrapTokenFromQuery();
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function bootstrapTokenFromQuery(): string | null {
  if (typeof window === "undefined") return null;
  const urlParams = new URLSearchParams(window.location.search);
  const urlToken = urlParams.get("token");
  if (urlToken) {
    localStorage.setItem(ACCESS_TOKEN_KEY, urlToken);
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

let refreshPromise: Promise<boolean> | null = null;

async function tryRefreshToken(): Promise<boolean> {
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
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
        localStorage.removeItem(ACCESS_TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        window.dispatchEvent(new Event("auth:logout"));
        return false;
      }
      const data = await res.json();
      localStorage.setItem(ACCESS_TOKEN_KEY, data.access_token);
      localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);
      return true;
    } catch {
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      window.dispatchEvent(new Event("auth:logout"));
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

async function request<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const isFormData = options.body instanceof FormData;
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { ...getHeaders(isFormData), ...(options.headers as Record<string, string> || {}) },
  });
  if (res.status === 401 && retry) {
    const refreshed = await tryRefreshToken();
    if (refreshed) return request<T>(path, options, false);
    throw new AuthError();
  }
  if (res.status === 401) throw new AuthError();
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export interface Secretaria {
  id: string;
  tenant_id: string;
  nome: string;
  slug: string;
  cnpj: string | null;
  descricao: string | null;
  ativo: boolean;
  ouvidor_responsavel: string | null;
  config: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface DashboardData {
  total_secretarias: number;
  secretarias_ativas: number;
  manifestacoes_abertas: number;
  manifestacoes_vencidas: number;
  avaliacoes_coletadas: number;
  is_admin: boolean;
}

export const api = {
  login(email: string, password: string) {
    return request<{ access_token: string; refresh_token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },

  me() {
    return request<{ id: string; email: string; name: string; roles: { id: string; name: string; label: string }[]; organization_id?: string | null }>("/auth/me");
  },

  getDashboard() {
    return request<DashboardData>("/dashboard");
  },

  listSecretarias() {
    return request<Secretaria[]>("/secretarias");
  },

  getSecretaria(id: string) {
    return request<Secretaria>(`/secretarias/${id}`);
  },

  createSecretaria(data: { nome: string; slug: string; cnpj?: string; descricao?: string; ouvidor_responsavel?: string; config?: Record<string, unknown> }) {
    return request<Secretaria>("/secretarias", { method: "POST", body: JSON.stringify(data) });
  },

  updateSecretaria(id: string, data: Record<string, unknown>) {
    return request<Secretaria>(`/secretarias/${id}`, { method: "PATCH", body: JSON.stringify(data) });
  },

  deleteSecretaria(id: string) {
    return request<{ ok: boolean }>(`/secretarias/${id}`, { method: "DELETE" });
  },
};

export { AuthError };
