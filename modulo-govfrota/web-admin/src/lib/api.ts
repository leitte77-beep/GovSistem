const BASE_URL = "/api/govfrota";
const ACCESS_TOKEN_KEY = "govfrota_access_token";
const DRIVER_TOKEN_KEY = "govfrota_motorista_token";

export class AuthError extends Error {
  constructor() {
    super("Não autenticado");
    this.name = "AuthError";
  }
}

function bootstrapTokenFromQuery(): string | null {
  if (typeof window === "undefined") return null;
  const urlToken = new URLSearchParams(window.location.search).get("token");
  if (urlToken) {
    localStorage.setItem(ACCESS_TOKEN_KEY, urlToken);
    window.history.replaceState({}, "", window.location.pathname);
    return urlToken;
  }
  return null;
}

function getToken(key: string): string | null {
  if (typeof window === "undefined") return null;
  bootstrapTokenFromQuery();
  return localStorage.getItem(key);
}

function getHeaders(key: string, isFormData = false): Record<string, string> {
  const headers: Record<string, string> = {};
  if (!isFormData) headers["Content-Type"] = "application/json";
  const token = getToken(key);
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  tokenKey: string = ACCESS_TOKEN_KEY
): Promise<T> {
  const isFormData = options.body instanceof FormData;
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { ...getHeaders(tokenKey, isFormData), ...((options.headers as Record<string, string>) || {}) },
  });
  if (res.status === 401) {
    localStorage.removeItem(tokenKey);
    window.dispatchEvent(new Event("auth:logout"));
    throw new AuthError();
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Erro inesperado" }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

/** Resultado paginado: corpo JSON + total de registros (header X-Total-Count). */
export interface Paginado<T> {
  itens: T[];
  total: number;
}

async function requestPaginado<T>(path: string): Promise<Paginado<T>> {
  const token = getToken(ACCESS_TOKEN_KEY);
  const res = await fetch(`${BASE_URL}${path}`, { headers: getHeaders(ACCESS_TOKEN_KEY) });
  if (res.status === 401) {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    window.dispatchEvent(new Event("auth:logout"));
    throw new AuthError();
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Erro inesperado" }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  const total = Number(res.headers.get("X-Total-Count") ?? "0");
  const itens = (await res.json()) as T[];
  return { itens, total };
}

/** Query string ignorando vazios */
function qs(params?: Record<string, unknown>): string {
  if (!params) return "";
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

// ── Área do motorista ────────────────────────────────────────────────────────

export const driverApi = {
  async login(login: string, pin: string) {
    const res = await fetch(`${BASE_URL}/app/motorista/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login, pin }),
    });
    const data = await res.json();
    if (!res.ok) {
      const e = new Error(data.detail || "Falha no login");
      (e as Error & { status?: number }).status = res.status;
      throw e;
    }
    localStorage.setItem(DRIVER_TOKEN_KEY, data.access_token);
    return data.motorista as { id: string; nome: string };
  },

  logout() {
    localStorage.removeItem(DRIVER_TOKEN_KEY);
  },

  me() {
    return request<{
      id: string;
      nome: string;
      organization_id: string;
      organization_name: string | null;
      foto_bomba_obrigatoria: boolean;
      foto_km_obrigatoria: boolean;
    }>("/app/motorista/me", {}, DRIVER_TOKEN_KEY);
  },

  veiculos(search?: string) {
    return request<VeiculoApp[]>(
      `/app/motorista/veiculos${qs({ search })}`, {}, DRIVER_TOKEN_KEY
    );
  },

  tanques() {
    return request<{ id: string; nome: string; combustivel_id: string }[]>(
      "/app/motorista/tanques", {}, DRIVER_TOKEN_KEY
    );
  },

  abastecer(dados: Record<string, unknown>) {
    return request<Record<string, unknown>>("/app/motorista/abastecimentos", { method: "POST", body: JSON.stringify(dados) }, DRIVER_TOKEN_KEY);
  },

  meusAbastecimentos() {
    return request<AbastecimentoRecenteMotorista[]>(
      "/app/motorista/abastecimentos", {}, DRIVER_TOKEN_KEY
    );
  },

  informarProblema(dados: Record<string, unknown>) {
    return request<{ ok: boolean; mensagem: string }>("/app/motorista/problemas", { method: "POST", body: JSON.stringify(dados) }, DRIVER_TOKEN_KEY);
  },

  async uploadFoto(file: File): Promise<string> {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`${BASE_URL}/uploads`, {
      method: "POST",
      headers: { Authorization: `Bearer ${getToken(DRIVER_TOKEN_KEY)}` },
      body: fd,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Falha no upload" }));
      throw new Error(err.detail);
    }
    const data = await res.json();
    return data.url as string;
  },
};

// ── API administrativa ───────────────────────────────────────────────────────

export const api = {
  me() {
    return request<{
      id: string;
      email: string;
      name: string;
      roles: { id: string; name: string; label: string }[];
      permissions: string[];
      organization_id: string | null;
      organization_name: string | null;
    }>("/auth/me");
  },

  // Veículos
  listVeiculos(params?: {
    search?: string;
    situacao?: string;
    tipo?: string;
    combustivel_id?: string;
    centro_custo?: string;
    unidade?: string;
    departamento?: string;
    filial?: string;
    sort_by?: string;
    order?: "asc" | "desc";
    skip?: number;
    limit?: number;
  }) {
    return requestPaginado<VeiculoListItem>(`/veiculos${qs(params)}`);
  },
  getVeiculo(id: string) {
    return request<Veiculo>(`/veiculos/${id}`);
  },
  createVeiculo(data: Record<string, unknown>) {
    return request<Veiculo>("/veiculos", { method: "POST", body: JSON.stringify(data) });
  },
  updateVeiculo(id: string, data: Record<string, unknown>) {
    return request<Veiculo>(`/veiculos/${id}`, { method: "PATCH", body: JSON.stringify(data) });
  },
  excluirVeiculo(id: string) {
    return request<void>(`/veiculos/${id}`, { method: "DELETE" });
  },
  alterarKm(id: string, quilometragem_atual: number, justificativa: string) {
    return request(`/veiculos/${id}/quilometragem`, { method: "POST", body: JSON.stringify({ quilometragem_atual, justificativa }) });
  },
  listDocumentos(veiculoId: string) {
    return request<DocumentoVeiculo[]>(`/veiculos/${veiculoId}/documentos`);
  },
  criarDocumento(veiculoId: string, data: Record<string, unknown>) {
    return request(`/veiculos/${veiculoId}/documentos`, { method: "POST", body: JSON.stringify(data) });
  },
  excluirDocumento(veiculoId: string, docId: string) {
    return request<void>(`/veiculos/${veiculoId}/documentos/${docId}`, { method: "DELETE" });
  },

  // Motoristas
  listMotoristas(params?: {
    search?: string;
    ativo?: boolean;
    cnh_categoria?: string;
    situacao_cnh?: string;
    acesso_status?: string;
    sort_by?: string;
    order?: "asc" | "desc";
    skip?: number;
    limit?: number;
  }) {
    return requestPaginado<MotoristaListItem>(`/motoristas${qs(params)}`);
  },
  getMotorista(id: string) {
    return request<Motorista>(`/motoristas/${id}`);
  },
  createMotorista(data: Record<string, unknown>) {
    return request<Motorista>("/motoristas", { method: "POST", body: JSON.stringify(data) });
  },
  updateMotorista(id: string, data: Record<string, unknown>) {
    return request<Motorista>(`/motoristas/${id}`, { method: "PATCH", body: JSON.stringify(data) });
  },
  excluirMotorista(id: string) {
    return request<void>(`/motoristas/${id}`, { method: "DELETE" });
  },
  getAcesso(id: string) {
    return request<AcessoInfo>(`/motoristas/${id}/acesso`);
  },
  gerarPinAcesso(id: string) {
    return request<AcessoAlterado>(
      `/motoristas/${id}/acesso/gerar-pin`,
      { method: "POST" }
    );
  },
  criarAcesso(id: string, data: { login: string; pin: string; confirm_pin: string }) {
    return request<AcessoAlterado>(`/motoristas/${id}/acesso`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },
  redefinirPin(id: string, data: { pin?: string; confirm_pin?: string }) {
    return request<AcessoAlterado>(`/motoristas/${id}/acesso/reset-pin`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  bloquearAcesso(id: string) {
    return request<AcessoInfo>(`/motoristas/${id}/acesso/block`, { method: "POST" });
  },
  desbloquearAcesso(id: string) {
    return request<AcessoInfo>(`/motoristas/${id}/acesso/unblock`, { method: "POST" });
  },
  atualizarCredencial(id: string, data: { login?: string; pin?: string; confirm_pin?: string }) {
    return request<AcessoAlterado>(`/motoristas/${id}/acesso`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  resumoMotorista(id: string) {
    return request<ResumoMotorista>(`/motoristas/${id}/resumo`);
  },

  // Combustíveis / tanques / estoque
  listCombustiveis(ativo?: boolean) {
    return request<Combustivel[]>(`/combustiveis${qs({ ativo })}`);
  },
  getCombustivel(id: string) {
    return request<Combustivel>(`/combustiveis/${id}`);
  },
  createCombustivel(data: Record<string, unknown>) {
    return request("/combustiveis", { method: "POST", body: JSON.stringify(data) });
  },
  updateCombustivel(id: string, data: Record<string, unknown>) {
    return request(`/combustiveis/${id}`, { method: "PATCH", body: JSON.stringify(data) });
  },
  listTanques() {
    return request<Tanque[]>("/tanques");
  },
  getTanque(id: string) {
    return request<Tanque>(`/tanques/${id}`);
  },
  createTanque(data: Record<string, unknown>) {
    return request("/tanques", { method: "POST", body: JSON.stringify(data) });
  },
  updateTanque(id: string, data: Record<string, unknown>) {
    return request(`/tanques/${id}`, { method: "PATCH", body: JSON.stringify(data) });
  },
  movimentacoesTanque(id: string, params?: Record<string, unknown>) {
    return requestPaginado<Movimentacao>(`/tanques/${id}/movimentacoes${qs(params)}`);
  },
  resumoTanque(id: string) {
    return request<ResumoTanque>(`/tanques/${id}/resumo`);
  },
  evolucaoTanque(id: string, dias: number) {
    return request<{ periodo_dias: number; pontos: { data: string; saldo: number }[] }>(
      `/tanques/${id}/evolucao?dias=${dias}`
    );
  },
  ajustarEstoque(tanque_id: string, quantidade: string, positivo: boolean, justificativa: string) {
    return request("/tanques/ajuste", { method: "POST", body: JSON.stringify({ tanque_id, quantidade, positivo, justificativa }) });
  },
  transferirEstoque(data: Record<string, unknown>) {
    return request("/tanques/transferencia", { method: "POST", body: JSON.stringify(data) });
  },
  registrarInventario(data: Record<string, unknown>) {
    return request<{ id: string; estoque_sistema: string; estoque_fisico: string; diferenca: string }>("/tanques/inventario", { method: "POST", body: JSON.stringify(data) });
  },
  aplicarInventario(id: string, justificativa: string) {
    return request<{ id: string }>(`/tanques/inventario/${id}/aplicar`, { method: "POST", body: JSON.stringify({ justificativa }) });
  },

  // Entradas de combustível
  listEntradas(params?: Record<string, unknown>) {
    return requestPaginado<Entrada>(`/entradas${qs(params)}`);
  },
  getEntrada(id: string) {
    return request<Entrada>(`/entradas/${id}`);
  },
  createEntrada(data: Record<string, unknown>) {
    return request("/entradas", { method: "POST", body: JSON.stringify(data) });
  },
  cancelarEntrada(id: string, justificativa: string) {
    return request(`/entradas/${id}/cancelar`, { method: "POST", body: JSON.stringify({ justificativa }) });
  },

  // Fornecedores e oficinas
  listFornecedores(params?: Record<string, unknown>) {
    return requestPaginado<Fornecedor>(`/fornecedores${qs(params)}`);
  },
  getFornecedor(id: string) {
    return request<Fornecedor & { historico_entradas: EntradaHist[] }>(`/fornecedores/${id}`);
  },
  createFornecedor(data: Record<string, unknown>) {
    return request("/fornecedores", { method: "POST", body: JSON.stringify(data) });
  },
  updateFornecedor(id: string, data: Record<string, unknown>) {
    return request(`/fornecedores/${id}`, { method: "PATCH", body: JSON.stringify(data) });
  },
  excluirFornecedor(id: string) {
    return request<void>(`/fornecedores/${id}`, { method: "DELETE" });
  },
  listOficinas() {
    return request<Oficina[]>("/oficinas");
  },
  createOficina(data: Record<string, unknown>) {
    return request("/oficinas", { method: "POST", body: JSON.stringify(data) });
  },
  updateOficina(id: string, data: Record<string, unknown>) {
    return request(`/oficinas/${id}`, { method: "PATCH", body: JSON.stringify(data) });
  },
  resumoOficina(id: string) {
    return request<ResumoOficina>(`/oficinas/${id}/resumo`);
  },

  // Abastecimentos
  listAbastecimentos(params?: {
    search?: string;
    veiculo_id?: string;
    motorista_id?: string;
    tanque_id?: string;
    combustivel_id?: string;
    origem?: string;
    status?: string;
    data_inicio?: string;
    data_fim?: string;
    sort_by?: string;
    order?: "asc" | "desc";
    skip?: number;
    limit?: number;
  }) {
    return requestPaginado<Abastecimento>(`/abastecimentos${qs(params)}`);
  },
  getAbastecimento(id: string) {
    return request<Abastecimento>(`/abastecimentos/${id}`);
  },
  resumoAbastecimentos() {
    return request<ResumoAbastecimento>("/abastecimentos/resumo");
  },
  correcoesAbastecimento(id: string) {
    return request<CorrecaoAbastecimento[]>(`/abastecimentos/${id}/correcoes`);
  },
  createAbastecimento(data: Record<string, unknown>) {
    return request("/abastecimentos", { method: "POST", body: JSON.stringify(data) });
  },
  cancelarAbastecimento(id: string, justificativa: string) {
    return request(`/abastecimentos/${id}/cancelar`, { method: "POST", body: JSON.stringify({ justificativa }) });
  },
  corrigirAbastecimento(id: string, data: Record<string, unknown>) {
    return request<Abastecimento>(`/abastecimentos/${id}/corrigir`, { method: "POST", body: JSON.stringify(data) });
  },

  // Manutenções
  listManutencoes(params?: Record<string, unknown>) {
    return request<Manutencao[]>(`/manutencoes${qs(params)}`);
  },
  getManutencao(id: string) {
    return request<Manutencao>(`/manutencoes/${id}`);
  },
  createManutencao(data: Record<string, unknown>) {
    return request("/manutencoes", { method: "POST", body: JSON.stringify(data) });
  },
  updateManutencao(id: string, data: Record<string, unknown>) {
    return request(`/manutencoes/${id}`, { method: "PATCH", body: JSON.stringify(data) });
  },
  adicionarItemManutencao(id: string, data: Record<string, unknown>) {
    return request(`/manutencoes/${id}/itens`, { method: "POST", body: JSON.stringify(data) });
  },
  listPlanosPreventivos(veiculo_id?: string) {
    return request<PlanoPreventivo[]>(`/planos-preventivos${qs({ veiculo_id })}`);
  },
  createPlanoPreventivo(data: Record<string, unknown>) {
    return request("/planos-preventivos", { method: "POST", body: JSON.stringify(data) });
  },

  // Ocorrências
  listOcorrencias(params?: {
    search?: string;
    veiculo_id?: string;
    motorista_id?: string;
    gravidade?: string;
    categoria?: string;
    status?: string;
    origem?: string;
    com_foto?: boolean;
    data_inicio?: string;
    data_fim?: string;
    sort_by?: string;
    order?: "asc" | "desc";
    skip?: number;
    limit?: number;
  }) {
    return requestPaginado<Ocorrencia>(`/ocorrencias${qs(params)}`);
  },
  getOcorrencia(id: string) {
    return request<Ocorrencia>(`/ocorrencias/${id}`);
  },
  createOcorrencia(data: Record<string, unknown>) {
    return request("/ocorrencias", { method: "POST", body: JSON.stringify(data) });
  },
  atualizarOcorrencia(id: string, data: Record<string, unknown>) {
    return request(`/ocorrencias/${id}`, { method: "PATCH", body: JSON.stringify(data) });
  },
  resolverOcorrencia(id: string, resolucao: string) {
    return request(`/ocorrencias/${id}/resolver`, { method: "POST", body: JSON.stringify({ resolucao }) });
  },
  converterEmManutencao(id: string) {
    return request<{ id: string }>(`/ocorrencias/${id}/converter-manutencao`, { method: "POST" });
  },

  // Dashboard / relatórios / busca
  dashboard() {
    return request<Dashboard>("/dashboard");
  },
  relatorioAbastecimentos(params?: Record<string, unknown>) {
    return request<RelatorioAbastecimentos>(`/relatorios/abastecimentos${qs(params)}`);
  },
  relatorioConsumoVeiculos(params?: Record<string, unknown>) {
    return request<RelatorioConsumo>(`/relatorios/veiculos/consumo${qs(params)}`);
  },
  relatorioCNH() {
    return request<{ itens: CNHItem[] }>("/relatorios/motoristas/cnh");
  },
  relatorioEstoque() {
    return request<RelatorioEstoque>("/relatorios/estoque");
  },
  relatorioManutencoes(params?: Record<string, unknown>) {
    return request<RelatorioManutencoes>(`/relatorios/manutencoes${qs(params)}`);
  },
  busca(q: string) {
    return request<ResultadoBusca>(`/busca?q=${encodeURIComponent(q)}`);
  },

  // Configurações
  getConfiguracoes() {
    return request<Configuracoes>("/configuracoes");
  },
  updateConfiguracoes(data: Partial<Configuracoes>) {
    return request<Configuracoes>("/configuracoes", { method: "PATCH", body: JSON.stringify(data) });
  },

  // Auditoria / notificações
  auditoria(entidade?: string) {
    return request<AuditoriaRegistro[]>(`/auditoria${qs({ entidade })}`);
  },
  notificacoes(nao_lidas?: boolean) {
    return request<NotificacaoItem[]>(`/notificacoes${qs({ nao_lidas })}`);
  },
  marcarLida(id: string) {
    return request<{ ok: boolean }>(`/notificacoes/${id}/marcar-lida`, { method: "POST" });
  },

  upload(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    return request<{ id: string; url: string }>("/uploads", { method: "POST", body: fd });
  },

  // Anexos (NF PDF/XML/foto): visualizar e baixar exigem autenticação.
  async abrirAnexo(anexo: { url: string; nome?: string; mime?: string | null }) {
    const token = getAccessToken();
    const res = await fetch(anexo.url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error("Falha ao carregar o documento.");
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.target = "_blank";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
  },

  async baixarAnexo(anexo: { url: string; nome?: string; mime?: string | null }) {
    const token = getAccessToken();
    const res = await fetch(anexo.url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error("Falha ao baixar o documento.");
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const nome = anexo.nome || "anexo";
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  },
};

export { bootstrapTokenFromQuery };

/** Token de acesso administrativo (para requisições autenticadas de imagem). */
export function getAccessToken(): string | null {
  return getToken(ACCESS_TOKEN_KEY);
}

// ── Tipos do app do motorista ─────────────────────────────────────────────────

export interface VeiculoApp {
  id: string;
  placa: string;
  modelo: string | null;
  marca: string | null;
  foto_url: string | null;
  usa_horimetro: boolean;
  combustivel_principal_id: string | null;
  combustivel_principal_nome: string | null;
  combustivel_secundario_id: string | null;
  combustivel_secundario_nome: string | null;
  quilometragem_atual: number;
  horimetro_atual: string | null;
  combustiveis?: { combustivel_id: string; nome: string; tank_type: string; capacidade: string | null }[];
}

export interface AbastecimentoRecenteMotorista {
  id: string;
  data: string;
  veiculo_id: string;
  placa: string | null;
  modelo: string | null;
  marca: string | null;
  combustivel: string | null;
  litros: number;
  km: number;
}

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface VeiculoListItem {
  id: string;
  placa: string;
  marca: string | null;
  modelo: string | null;
  tipo: string;
  situacao: string;
  quilometragem_atual: number;
  cor: string | null;
  foto_url?: string | null;
  usa_horimetro?: boolean;
  horimetro_atual?: string | null;
  combustivel_principal_id?: string | null;
  consumo_medio_km_l?: number | null;
  ultimo_abastecimento?: { data: string; litros: number } | null;
  ultima_manutencao?: { data: string; status: string } | null;
  proxima_manutencao?: { nome: string; proxima_km: number | null; proxima_data: string | null; situacao: string } | null;
}
export interface Veiculo extends VeiculoListItem {
  renavam: string | null;
  chassi: string | null;
  codigo_interno: string | null;
  patrimonio: string | null;
  versao: string | null;
  ano_fabricacao: number | null;
  ano_modelo: number | null;
  combustivel_principal_id: string | null;
  combustivel_secundario_id: string | null;
  capacidade_tanque_litros: string | null;
  horimetro_atual: string | null;
  usa_horimetro: boolean;
  unidade: string | null;
  departamento: string | null;
  filial: string | null;
  centro_custo: string | null;
  observacoes: string | null;
  vencimento_licenciamento: string | null;
  vencimento_seguro: string | null;
  foto_url: string | null;
  tanques?: VeiculoTanque[];
}
export interface VeiculoTanque {
  id: string;
  combustivel_id: string;
  combustivel_nome: string | null;
  tank_type: "PRIMARY" | "AUXILIARY";
  capacidade: string;
  identificacao: string | null;
  ativo: boolean;
}
export interface DocumentoVeiculo {
  id: string;
  descricao: string;
  tipo: string | null;
  vencimento: string | null;
}
export interface MotoristaListItem {
  id: string;
  nome: string;
  cpf: string;
  cnh_validade: string | null;
  cnh_categoria: string | null;
  ativo: boolean;
  telefone: string | null;
  matricula: string | null;
  email: string | null;
  cnh_numero: string | null;
  foto_url: string | null;
  acesso_login: string | null;
  acesso_bloqueado: boolean;
  ultimo_acesso: string | null;
  situacao_cnh: string | null;
}
export interface Motorista extends MotoristaListItem {
  observacoes: string | null;
}
export interface AcessoInfo {
  login: string | null;
  bloqueado: boolean;
  ultimo_acesso: string | null;
}
export interface AcessoAlterado extends AcessoInfo {
  pin_alterado: boolean;
  /** PIN em texto claro — retornado apenas na resposta da operação que o definiu. */
  pin_provisorio: string | null;
}
export interface ResumoMotorista {
  total_abastecimentos: number;
  total_litros: number;
  ultimos_abastecimentos: { id: string; data: string; veiculo_id: string; litros: number; km: number }[];
}
export interface Combustivel {
  id: string;
  nome: string;
  unidade: string;
  categoria?: string;
  descricao?: string | null;
  foto_url?: string | null;
  ativo: boolean;
  total_tanques?: number;
  total_veiculos?: number;
}
export interface Tanque {
  id: string;
  nome: string;
  codigo: string | null;
  localizacao: string | null;
  combustivel_id: string;
  combustivel_nome: string | null;
  combustivel_unidade?: string | null;
  capacidade_maxima: string;
  estoque_inicial: string;
  estoque_atual: string;
  estoque_minimo: string;
  percentual_disponivel: number | null;
  status_estoque: string | null;
  foto_url?: string | null;
  ultima_movimentacao?: {
    id: string;
    tipo: string;
    sinal: number;
    quantidade: number;
    descricao: string | null;
    created_at: string;
  } | null;
  ativo: boolean;
  observacoes: string | null;
}
export interface Movimentacao {
  id: string;
  tipo: string;
  origem: string;
  sinal: number;
  quantidade: string;
  descricao: string | null;
  saldo_apos: string | null;
  responsavel_nome?: string | null;
  tanque_destino_nome?: string | null;
  tanque_origem_nome?: string | null;
  created_at: string;
}
export interface ResumoTanque {
  consumo_medio_diario_litros: number | null;
  previsao_dias_restantes: number | null;
  autonomia_dias?: number | null;
  custo_medio_por_litro?: number | null;
  valor_estoque?: number | null;
  ultimos_abastecimentos: { id: string; data: string; litros: number }[];
}
export interface EntradaAnexo {
  id: string;
  nome: string;
  tipo: string;
  mime: string | null;
  url: string;
}
export interface Entrada {
  id: string;
  tanque_id: string;
  combustivel_id: string;
  fornecedor_id: string | null;
  quantidade_litros: string;
  data_entrada: string;
  numero_nota: string | null;
  serie_nota: string | null;
  chave_nfe: string | null;
  valor_total: string | null;
  valor_por_litro: string | null;
  observacoes: string | null;
  cancelada: boolean;
  cancelada_em?: string | null;
  motivo_cancelamento?: string | null;
  responsavel_usuario_id: string | null;
  tanque_nome?: string | null;
  combustivel_nome?: string | null;
  fornecedor_nome?: string | null;
  anexos?: EntradaAnexo[];
}
export interface EntradaHist {
  id: string;
  data: string;
  litros: number;
  valor: number | null;
  nota: string | null;
  cancelada: boolean;
}
export interface Fornecedor {
  id: string;
  razao_social: string;
  nome_fantasia: string | null;
  cpf_cnpj: string | null;
  telefone: string | null;
  email: string | null;
  site: string | null;
  contato: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  endereco: string | null;
  foto_url?: string | null;
  categoria: string;
  observacoes: string | null;
  ativo: boolean;
  total_entradas?: number;
  litros_fornecidos?: number;
  valor_total?: number;
  ultima_compra?: { id: string; data: string; litros: number; valor: number | null; nota: string | null; cancelada: boolean } | null;
}
export interface Oficina {
  id: string;
  nome: string;
  razao_social: string | null;
  cpf_cnpj: string | null;
  telefone: string | null;
  email: string | null;
  endereco: string | null;
  responsavel: string | null;
  especialidade: string | null;
  observacoes: string | null;
  ativo: boolean;
}
export interface ResumoOficina {
  total_manutencoes: number;
  valor_total: number;
}
export interface Abastecimento {
  id: string;
  veiculo_id: string;
  motorista_id: string | null;
  tanque_id: string;
  combustivel_id: string;
  quantidade_litros: string;
  quilometragem: number;
  completou_tanque: boolean | null;
  origem: string;
  lancado_por_usuario_id: string | null;
  data_abastecimento: string;
  custo_total: string | null;
  custo_medio_litro: string | null;
  consumo_km_l?: string | number | null;
  status: string;
  ip_origem?: string | null;
  observacoes?: string | null;
  foto_bomba_url?: string | null;
  foto_painel_url?: string | null;
  created_at?: string | null;
  cancelado_em?: string | null;
  motivo_cancelamento?: string | null;
  veiculo_placa?: string | null;
  veiculo_modelo?: string | null;
  veiculo_marca?: string | null;
  veiculo_foto_url?: string | null;
  veiculo_usa_horimetro?: boolean | null;
  combustivel_nome?: string | null;
  tanque_nome?: string | null;
  motorista_nome?: string | null;
  lancado_por_nome?: string | null;
  cancelado_por_nome?: string | null;
}
export interface ResumoAbastecimento {
  hoje_quantidade: number;
  hoje_litros: number;
  mes_litros: number;
  mes_gasto: number;
  consumo_medio_frota: number | null;
}
export interface CorrecaoAbastecimento {
  id: string;
  abastecimento_id: string;
  tipo_correcao: string;
  dados_anteriores_json: string | null;
  dados_novos_json: string | null;
  justificativa: string | null;
  usuario_id: string | null;
  created_at: string;
}
export interface Manutencao {
  id: string;
  veiculo_id: string;
  tipo: string;
  status: string;
  prioridade: string;
  data_solicitacao: string;
  previsao_conclusao: string | null;
  data_conclusao: string | null;
  valor_total: string;
  descricao_problema: string | null;
  oficina_id: string | null;
  oficina_nome?: string | null;
  veiculo_placa?: string | null;
  quilometragem?: number | null;
  observacoes?: string | null;
  itens?: { id: string; categoria: string; descricao: string; quantidade: number; valor_unitario: string; valor_total: string }[];
  ocorrencia_origem_id?: string | null;
  ocorrencia_placa?: string | null;
  ocorrencia_descricao?: string | null;
  veiculo_modelo?: string | null;
  veiculo_marca?: string | null;
  veiculo_foto_url?: string | null;
  veiculo_usa_horimetro?: boolean | null;
}
export interface PlanoPreventivo {
  id: string;
  veiculo_id: string;
  nome: string;
  base: string;
  intervalo_km: number | null;
  intervalo_meses: number | null;
  proxima_execucao_km: number | null;
  proxima_execucao_data: string | null;
  situacao_alerta: string | null;
  ativo: boolean;
}
export interface Ocorrencia {
  id: string;
  veiculo_id: string;
  motorista_id: string | null;
  categoria: string;
  descricao: string;
  quilometragem: number | null;
  gravidade: string;
  status: string;
  foto_url: string | null;
  data_ocorrencia: string;
  manutencao_id: string | null;
  origem: string;
  created_at?: string | null;
  updated_at?: string | null;
  veiculo_placa?: string | null;
  veiculo_modelo?: string | null;
  veiculo_marca?: string | null;
  veiculo_foto_url?: string | null;
  veiculo_usa_horimetro?: boolean | null;
  motorista_nome?: string | null;
}
export interface Dashboard {
  organizacao: { id: string | null; nome: string | null };
  atualizado_em: string;
  onboarding: {
    veiculos: number;
    motoristas: number;
    tanques: number;
    abastecimentos: number;
    entradas: number;
    pendente: boolean;
  };
  ultimos_abastecimentos: {
    id: string;
    data: string;
    veiculo_id: string;
    placa: string | null;
    modelo: string | null;
    motorista: string | null;
    combustivel: string | null;
    litros: number;
    quilometragem: number;
    custo_total: number;
  }[];
  proximas_preventivas: {
    plano_id: string;
    veiculo_id: string;
    placa: string | null;
    modelo: string | null;
    nome: string;
    base: string;
    restante_km: number | null;
    restante_dias: number | null;
    situacao: "VENCIDA" | "PROXIMA" | "EM_DIA" | null;
  }[];
  documentos_vencendo: {
    id: string;
    veiculo_id: string;
    placa: string | null;
    descricao: string;
    vencimento: string;
    dias_restantes: number;
  }[];
  frota: {
    total: number;
    disponiveis: number;
    em_uso: number;
    em_manutencao: number;
    indisponiveis: number;
  };
  tanques: {
    id: string;
    nome: string;
    combustivel: string | null;
    capacidade: number | null;
    estoque_atual: number;
    estoque_minimo: number;
    percentual: number | null;
    status_estoque: string;
  }[];
  abastecimentos: {
    hoje_litros: number;
    hoje_quantidade: number;
    mes_litros: number;
    mes_gasto: number;
    mes_quantidade: number;
  };
  manutencao: {
    abertas: number;
    veiculos_em_manutencao: number;
    preventivas_proximas: number;
    preventivas_vencidas: number;
  };
  ocorrencias_criticas: number;
  cnh_alertas: {
    vencidas: CNHItem[];
    vence_7: CNHItem[];
    vence_30: CNHItem[];
  };
  graficos: {
    consumo_7d: { litros: number; quantidade: number };
    consumo_30d: { litros: number; quantidade: number };
    consumo_12m: { litros: number; quantidade: number };
    evolucao_mensal: { mes: string; litros: number; gasto: number; quantidade: number }[];
    ranking_veiculos: {
      veiculo_id: string;
      placa: string | null;
      modelo: string | null;
      litros: number;
      custo_combustivel: number;
      custo_manutencao: number;
      consumo_medio_km_l: number | null;
      custo_total: number;
    }[];
  };
}
export interface CNHItem {
  id: string;
  nome: string;
  validade?: string;
  cnh_validade?: string;
  dias_restantes: number;
  situacao?: string;
}
export interface RelatorioAbastecimentos {
  total_registros: number;
  total_litros: number;
  total_gasto: number;
  itens: {
    data: string;
    placa: string;
    motorista: string | null;
    combustivel: string;
    litros: number;
    km: number;
    custo_total: number | null;
  }[];
}
export interface RelatorioConsumo {
  periodo: { inicio: string; fim: string };
  itens: {
    placa: string;
    modelo: string;
    km_rodados: number;
    litros: number;
    consumo_medio: number | null;
    valor_combustivel: number;
    valor_manutencao: number;
    custo_total: number;
    custo_por_km: number | null;
  }[];
}
export interface RelatorioEstoque {
  tanques: { id: string; nome: string; combustivel: string | null; capacidade: number; estoque_atual: number; estoque_minimo: number }[];
  entradas_30d: Record<string, { litros: number; valor: number }>;
}
export interface RelatorioManutencoes {
  total_registros: number;
  valor_total: number;
  itens: { placa: string; tipo: string; status: string; oficina: string | null; data_solicitacao: string; valor_total: number }[];
}
export interface ResultadoBusca {
  veiculos: { id: string; placa: string; modelo: string | null }[];
  motoristas: { id: string; nome: string }[];
  fornecedores: { id: string; nome: string }[];
  oficinas: { id: string; nome: string }[];
}
export interface Configuracoes {
  tipo_organizacao: string;
  nome_modulo: string;
  foto_obrigatoria: boolean;
  foto_bomba_obrigatoria: boolean;
  foto_km_obrigatoria: boolean;
  exigir_tanque_cheio: boolean;
  permitir_retroativo: boolean;
  tolerancia_km_percentual: number;
  alerta_consumo_desvio_pct: number;
  bloquear_cnh_vencida: boolean;
  permitir_estoque_negativo: boolean;
  exigir_nf_entrada: boolean;
  exigir_fornecedor_entrada: boolean;
  antecedencia_alerta_manutencao_dias: number;
}
export interface AuditoriaRegistro {
  id: string;
  acao: string;
  entidade: string;
  entidade_id?: string | null;
  usuario_id: string | null;
  motorista_id: string | null;
  justificativa: string | null;
  created_at: string;
  actor_type?: "user" | "driver" | "system" | string | null;
  actor_id?: string | null;
  actor_name?: string | null;
}
export interface NotificacaoItem {
  id: string;
  titulo: string;
  severidade: string;
  lida: boolean;
  created_at: string;
}
