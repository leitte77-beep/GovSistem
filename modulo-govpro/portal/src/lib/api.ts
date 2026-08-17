const BASE_URL = "/api/govpro/v1";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function citizenToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem("govpro_citizen_token");
}

export function setCitizenToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) sessionStorage.setItem("govpro_citizen_token", token);
  else sessionStorage.removeItem("govpro_citizen_token");
}

export function hasCitizenToken(): boolean {
  return citizenToken() !== null;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const isFormData = options.body instanceof FormData;
  const headers: Record<string, string> = {};
  if (!isFormData) headers["Content-Type"] = "application/json";
  const token = citizenToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers ?? {}) },
  });

  if (res.status === 401 && token) {
    setCitizenToken(null);
    if (typeof window !== "undefined") window.dispatchEvent(new Event("citizen:logout"));
  }

  if (!res.ok) {
    const err = (await res.json().catch(() => ({ detail: "Erro desconhecido" }))) as {
      detail?: string;
    };
    throw new ApiError(err.detail || `HTTP ${res.status}`, res.status);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  // ── Público (sem login) ────────────────────────────────────────────────────
  listOrganizacoes() {
    return request<import("@/types/public").OrgPublico[]>("/public/organizacoes");
  },
  listTiposProcesso(orgSlug: string) {
    return request<import("@/types/public").TipoProcessoPublico[]>(
      `/public/tipos-processo?org_slug=${encodeURIComponent(orgSlug)}`
    );
  },
  validar(codigo: string, crc: string) {
    return request<import("@/types/public").ValidacaoResultado>(
      `/public/validar?codigo=${encodeURIComponent(codigo)}&crc=${encodeURIComponent(crc)}`
    );
  },
  consultarProcesso(nup: string, orgSlug: string) {
    return request<import("@/types/public").ConsultaResultado>(
      `/public/processos/${encodeURIComponent(nup)}?org_slug=${encodeURIComponent(orgSlug)}`
    );
  },
  registrarCidadao(data: {
    org_slug: string;
    nome: string;
    email: string;
    cpf_cnpj: string;
    senha: string;
    telefone?: string;
    aceite_termo: boolean;
  }) {
    return request<{ id: string; status: string; mensagem: string }>("/public/cidadao/registrar", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  loginCidadao(data: { org_slug: string; email: string; senha: string }) {
    return request<{ token: string; token_type: string }>("/public/cidadao/login", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  criarManifestacao(data: import("@/types/public").ManifestacaoInput) {
    return request<{ id: string; status: string }>("/public/manifestacoes", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  // ── Cidadão autenticado ────────────────────────────────────────────────────
  me() {
    return request<import("@/types/public").CitizenMe>("/public/cidadao/me");
  },
  meusProcessos() {
    return request<import("@/types/public").MeuProcesso[]>("/public/meus-processos");
  },
  minhasIntimacoes() {
    return request<import("@/types/public").MinhaIntimacao[]>("/public/minhas-intimacoes");
  },
  darCiencia(intimacaoId: string) {
    return request<{ id: string; status: string }>(`/public/intimacoes/${intimacaoId}/ciencia`, {
      method: "POST",
    });
  },
  peticionarNovo(data: { tipo_processo_id: string; especificacao: string }) {
    return request<import("@/types/public").ReciboPeticionamento>("/public/peticionamentos", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  peticionarIntercorrente(nup: string, arquivo: File, titulo: string) {
    const fd = new FormData();
    fd.append("arquivo", arquivo);
    fd.append("titulo", titulo);
    return request<{ documento_id: string }>(`/public/processos/${encodeURIComponent(nup)}/peticionar`, {
      method: "POST",
      body: fd,
    });
  },
};
