import type { Convenio, ConvenioListItem, Etapa, TimelineEvent, Anexo, Tarefa, TarefaListItem, Comentario, Contestacao, Notificacao, TemplateFluxo, Setor } from "@/types/govtask";

const BASE_URL = "/api/govtask";
const ACCESS_TOKEN_KEY = "govtask_access_token";
const REFRESH_TOKEN_KEY = "govtask_refresh_token";

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

export const api = {
  login(email: string, password: string) {
    return request<{ access_token: string; refresh_token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },

  me() {
    return request<{ id: string; email: string; name: string; roles: { id: string; name: string; label: string }[] }>("/auth/me");
  },

  listConvenios(params?: { status?: string; tipo?: string; search?: string; skip?: number; limit?: number }) {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.tipo) q.set("tipo", params.tipo);
    if (params?.search) q.set("search", params.search);
    if (params?.skip) q.set("skip", String(params.skip));
    if (params?.limit) q.set("limit", String(params.limit));
    const qs = q.toString();
    return request<ConvenioListItem[]>(`/convenios${qs ? `?${qs}` : ""}`);
  },

  getConvenio(id: string) {
    return request<Convenio>(`/convenios/${id}`);
  },

  createConvenio(data: { titulo: string; descricao?: string; tipo?: string; origem?: string; valor?: number; template_fluxo_id?: string }) {
    return request<Convenio>("/convenios", { method: "POST", body: JSON.stringify(data) });
  },

  updateConvenio(id: string, data: Record<string, unknown>) {
    return request<Convenio>(`/convenios/${id}`, { method: "PATCH", body: JSON.stringify(data) });
  },

  registrarProtocolo(id: string, data: { numero_protocolo: string; data_protocolo?: string }) {
    return request<Convenio>(`/convenios/${id}/protocolo`, { method: "POST", body: JSON.stringify(data) });
  },

  getTimeline(convenioId: string) {
    return request<TimelineEvent[]>(`/convenios/${convenioId}/timeline`);
  },

  deleteConvenio(id: string) {
    return request<void>(`/convenios/${id}`, { method: "DELETE" });
  },

  createEtapa(convenioId: string, data: { nome: string; natureza?: string; prazo_governo?: string; ordem?: number }) {
    return request<Etapa>(`/convenios/${convenioId}/etapas`, { method: "POST", body: JSON.stringify(data) });
  },

  updateEtapa(id: string, data: Record<string, unknown>) {
    return request<Etapa>(`/etapas/${id}`, { method: "PATCH", body: JSON.stringify(data) });
  },

  deleteEtapa(id: string) {
    return request<void>(`/etapas/${id}`, { method: "DELETE" });
  },

  encaminharGoverno(etapaId: string, observacao?: string) {
    return request<Etapa>(`/etapas/${etapaId}/encaminhar-governo`, {
      method: "POST",
      body: JSON.stringify({ observacao }),
    });
  },

  registrarRespostaGoverno(etapaId: string, resposta: string) {
    return request<Etapa>(`/etapas/${etapaId}/resposta-governo`, {
      method: "POST",
      body: JSON.stringify({ resposta }),
    });
  },

  concluirEtapa(etapaId: string) {
    return request<Etapa>(`/etapas/${etapaId}/concluir`, { method: "POST" });
  },

  listTarefas(params?: { minhas?: boolean; setor_id?: string; status?: string; atrasadas?: boolean; convenio_id?: string; skip?: number; limit?: number }) {
    const q = new URLSearchParams();
    if (params?.minhas) q.set("minhas", "true");
    if (params?.setor_id) q.set("setor_id", params.setor_id);
    if (params?.status) q.set("status", params.status);
    if (params?.atrasadas) q.set("atrasadas", "true");
    if (params?.convenio_id) q.set("convenio_id", params.convenio_id);
    if (params?.skip) q.set("skip", String(params.skip));
    if (params?.limit) q.set("limit", String(params.limit));
    const qs = q.toString();
    return request<TarefaListItem[]>(`/tarefas${qs ? `?${qs}` : ""}`);
  },

  getTarefa(id: string) {
    return request<Tarefa>(`/tarefas/${id}`);
  },

  createTarefa(etapaId: string, data: Record<string, unknown>) {
    return request<Tarefa>(`/etapas/${etapaId}/tarefas`, { method: "POST", body: JSON.stringify(data) });
  },

  updateTarefa(id: string, data: Record<string, unknown>) {
    return request<Tarefa>(`/tarefas/${id}`, { method: "PATCH", body: JSON.stringify(data) });
  },

  aceitarTarefa(id: string) {
    return request<Tarefa>(`/tarefas/${id}/aceitar`, { method: "POST" });
  },

  entregarTarefa(id: string) {
    return request<Tarefa>(`/tarefas/${id}/entregar`, { method: "POST" });
  },

  devolverTarefa(id: string, texto: string) {
    return request<Tarefa>(`/tarefas/${id}/devolver`, {
      method: "POST",
      body: JSON.stringify({ texto }),
    });
  },

  concluirTarefa(id: string) {
    return request<Tarefa>(`/tarefas/${id}/concluir`, { method: "POST" });
  },

  cancelarTarefa(id: string) {
    return request<Tarefa>(`/tarefas/${id}/cancelar`, { method: "POST" });
  },

  addComentario(tarefaId: string, texto: string) {
    return request<Comentario>(`/tarefas/${tarefaId}/comentarios`, {
      method: "POST",
      body: JSON.stringify({ texto }),
    });
  },

  criarContestacao(tarefaId: string, data: { motivo: string; novo_prazo_solicitado: string }) {
    return request<Contestacao>(`/tarefas/${tarefaId}/contestacoes`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  decidirContestacao(id: string, data: { aprovada: boolean; justificativa?: string }) {
    return request<Contestacao>(`/contestacoes/${id}/decidir`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  uploadAnexo(convenioId: string, file: File, tipoDocumento: string, etapaId?: string, tarefaId?: string) {
    const fd = new FormData();
    fd.append("file", file);
    let url = `/anexos?convenio_id=${convenioId}&tipo_documento=${tipoDocumento}`;
    if (etapaId) url += `&etapa_id=${etapaId}`;
    if (tarefaId) url += `&tarefa_id=${tarefaId}`;
    return request<Anexo>(url, { method: "POST", body: fd });
  },

  getAnexo(id: string) {
    return request<Anexo>(`/anexos/${id}`);
  },

  deleteAnexo(id: string) {
    return request<void>(`/anexos/${id}`, { method: "DELETE" });
  },

  listNotificacoes(params?: { nao_lidas?: boolean }) {
    const q = params?.nao_lidas ? "?nao_lidas=true" : "";
    return request<Notificacao[]>(`/notificacoes${q}`);
  },

  marcarLida(id: string) {
    return request<{ ok: boolean }>(`/notificacoes/${id}/marcar-lida`, { method: "POST" });
  },

  marcarTodasLidas() {
    return request<{ ok: boolean }>("/notificacoes/marcar-todas-lidas", { method: "POST" });
  },

  listSetores() {
    return request<Setor[]>("/admin/setores");
  },

  listUsers() {
    return request<{ id: string; name: string; email: string }[]>("/admin/users");
  },

  listTemplatesFluxo(tipo?: string) {
    const q = tipo ? `?tipo_convenio=${tipo}` : "";
    return request<TemplateFluxo[]>(`/admin/templates-fluxo${q}`);
  },

  createTemplateFluxo(data: Record<string, unknown>) {
    return request<TemplateFluxo>("/admin/templates-fluxo", { method: "POST", body: JSON.stringify(data) });
  },

  getTemplateFluxo(id: string) {
    return request<{ id: string; nome: string; tipo_convenio: string; descricao: string | null; etapas: { id: string; nome: string; ordem: number; natureza: string }[] }>(`/admin/templates-fluxo/${id}`);
  },

  updateTemplateFluxo(id: string, data: Record<string, unknown>) {
    return request(`/admin/templates-fluxo/${id}`, { method: "PATCH", body: JSON.stringify(data) });
  },

  deleteTemplateFluxo(id: string) {
    return request<void>(`/admin/templates-fluxo/${id}`, { method: "DELETE" });
  },

  getEtapa(id: string) {
    return request<Etapa>(`/etapas/${id}`);
  },

  getContestacao(id: string) {
    return request<Contestacao>(`/contestacoes/${id}`);
  },

  createSetor(data: { nome: string; sigla?: string; descricao?: string }) {
    return request("/admin/setores", { method: "POST", body: JSON.stringify(data) });
  },

  updateSetor(id: string, data: Record<string, unknown>) {
    return request(`/admin/setores/${id}`, { method: "PATCH", body: JSON.stringify(data) });
  },

  deleteSetor(id: string) {
    return request<void>(`/admin/setores/${id}`, { method: "DELETE" });
  },

  getDashboard() {
    return request<import("@/types/govtask").DashboardData>("/dashboard");
  },
};

export { AuthError };
