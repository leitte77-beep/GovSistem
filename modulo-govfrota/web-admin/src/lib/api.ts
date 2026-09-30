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
      exigir_tanque_cheio?: boolean;
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

  /** Onde o motorista pode abastecer: tanques próprios e postos credenciados. */
  locais() {
    return request<LocaisAbastecimento>("/app/motorista/locais", {}, DRIVER_TOKEN_KEY);
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
    unidade_id?: string;
    departamento?: string;
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
    return request<FornecedorDetalhe>(`/fornecedores/${id}`);
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
  painelSecretaria(params?: { inicio?: string; fim?: string; unidade_id?: string }) {
    return request<PainelSecretaria>(`/secretaria/painel${qs(params)}`);
  },
  // Acessos: perfil no GovFrota e escopo por secretaria
  listPerfisAcesso() {
    return request<PerfilAcesso[]>("/acessos/perfis");
  },
  listAcessosUsuarios() {
    return request<AcessoUsuario[]>("/acessos/usuarios");
  },
  updateAcessoUsuario(userId: string, data: { perfil: string | null; cargo: string | null; unidade_ids: string[] }) {
    return request<AcessoUsuario>(`/acessos/usuarios/${userId}`, { method: "PUT", body: JSON.stringify(data) });
  },
  listAcessosPortal(fornecedorId: string) {
    return request<AcessoPortal[]>(`/fornecedores/${fornecedorId}/acessos`);
  },
  criarAcessoPortal(fornecedorId: string, data: { nome: string; email?: string | null; login: string }) {
    return request<AcessoPortal & { senha_provisoria: string }>(`/fornecedores/${fornecedorId}/acessos`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  acaoAcessoPortal(fornecedorId: string, acessoId: string, acao: "redefinir-senha" | "bloquear" | "desbloquear") {
    return request<AcessoPortal & { senha_provisoria?: string }>(`/fornecedores/${fornecedorId}/acessos/${acessoId}/${acao}`, {
      method: "POST",
    });
  },
  listContratosPosto(fornecedorId: string) {
    return request<ContratoPosto[]>(`/fornecedores/${fornecedorId}/contratos`);
  },
  createContratoPosto(fornecedorId: string, data: Record<string, unknown>) {
    return request<ContratoPosto>(`/fornecedores/${fornecedorId}/contratos`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  updateContratoPosto(fornecedorId: string, contratoId: string, data: Record<string, unknown>) {
    return request<ContratoPosto>(`/fornecedores/${fornecedorId}/contratos/${contratoId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  excluirContratoPosto(fornecedorId: string, contratoId: string) {
    return request<void>(`/fornecedores/${fornecedorId}/contratos/${contratoId}`, { method: "DELETE" });
  },

  // Unidades (secretarias / centros de custo)
  listUnidades(ativo?: boolean) {
    return request<Unidade[]>(`/unidades${qs({ ativo })}`);
  },
  createUnidade(data: { nome: string; sigla?: string | null }) {
    return request<Unidade>("/unidades", { method: "POST", body: JSON.stringify(data) });
  },
  updateUnidade(id: string, data: Partial<Pick<Unidade, "nome" | "sigla" | "ativo">>) {
    return request<Unidade>(`/unidades/${id}`, { method: "PATCH", body: JSON.stringify(data) });
  },
  excluirUnidade(id: string) {
    return request<void>(`/unidades/${id}`, { method: "DELETE" });
  },

  // Abastecimentos
  listAbastecimentos(params?: {
    search?: string;
    veiculo_id?: string;
    motorista_id?: string;
    tanque_id?: string;
    fornecedor_id?: string;
    unidade_id?: string;
    modalidade?: string;
    com_alerta?: boolean;
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
  relatorioSecretarias(params?: Record<string, unknown>) {
    return request<RelatorioSecretarias>(`/relatorios/secretarias${qs(params)}`);
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
  marcarTodasLidas() {
    return request<{ ok: boolean }>("/notificacoes/marcar-todas-lidas", { method: "POST" });
  },
  alertas() {
    return request<{ itens: AlertaAtual[]; notificacoes_nao_lidas: number }>("/alertas");
  },

  upload(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    return request<{ id: string; url: string }>("/uploads", { method: "POST", body: fd });
  },

  // Notas fiscais enviadas pelo portal do posto (tela de Faturamento).
  listNotasFiscais(params: FiltroNotasFiscais & { skip?: number; limit?: number }) {
    return request<ListaNotasFiscais>(`/notas-fiscais${qs({ ...params })}`);
  },
  urlNotaFiscal(notaId: string) {
    return `${BASE_URL}/notas-fiscais/${notaId}/arquivo`;
  },
  async baixarNotasZip(params: FiltroNotasFiscais & { tipos?: string }) {
    const token = getAccessToken();
    const res = await fetch(`${BASE_URL}/notas-fiscais/zip${qs({ ...params })}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Falha ao gerar o ZIP." }));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }
    const nome = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") || "")?.[1] || "notas-fiscais.zip";
    const objectUrl = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
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
  horimetro?: number | null;
  local?: string | null;
}

export interface LocaisAbastecimento {
  tanques: { id: string; nome: string; combustivel_id: string }[];
  postos: {
    id: string;
    nome: string;
    endereco: string | null;
    /** Preço contratado por combustível (ausente no cache de versões antigas). */
    precos?: { combustivel_id: string; preco_litro: number }[];
  }[];
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
  unidade_id?: string | null;
  unidade_nome?: string | null;
  tanques?: VeiculoTanque[];
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
  unidade_id: string | null;
  unidade_nome: string | null;
  departamento: string | null;
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
  combustivel_alternativo_id?: string | null;
  combustivel_alternativo_nome?: string | null;
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
export interface FiltroNotasFiscais {
  inicio?: string;
  fim?: string;
  fornecedor_id?: string;
  unidade_id?: string;
  situacao?: string;
  busca?: string;
}

export interface NotaFiscalItem {
  id: string;
  data: string;
  placa: string;
  marca: string | null;
  modelo: string | null;
  motorista: string | null;
  combustivel: string;
  secretaria: string | null;
  posto: string | null;
  litros: number;
  valor: number | null;
  nota: {
    numero: string | null;
    serie: string | null;
    chave: string | null;
    valor: number | null;
    emissao: string | null;
    enviada_em: string | null;
    xml_id: string | null;
    pdf_id: string | null;
    avisos: string[];
  } | null;
}

export interface ListaNotasFiscais {
  resumo: { abastecimentos: number; com_nota: number; sem_nota: number; total_filtrado: number; valor_filtrado: number };
  itens: NotaFiscalItem[];
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
  posto_credenciado?: boolean;
  observacoes: string | null;
  ativo: boolean;
  total_entradas?: number;
  litros_fornecidos?: number;
  valor_total?: number;
  ultima_compra?: { id: string; data: string; litros: number; valor: number | null; nota: string | null; cancelada: boolean } | null;
  total_abastecimentos?: number;
  litros_abastecidos?: number;
  valor_abastecimentos?: number;
  total_manutencoes?: number;
  valor_manutencoes?: number;
}
export interface PainelSecretaria {
  periodo: { inicio: string; fim: string };
  secretarias: { id: string; nome: string; sigla: string | null }[];
  secretaria_id: string | null;
  restrito: boolean;
  indicadores: {
    gasto: number;
    litros: number;
    abastecimentos: number;
    veiculos_ativos: number;
    km_percorridos: number;
    custo_por_km: number | null;
    consumo_km_l: number | null;
    com_alerta: number;
    valor_com_nota: number | null;
    valor_sem_nota: number | null;
  };
  mensal: { mes: string; gasto: number; litros: number; abastecimentos: number; custo_por_km: number | null }[];
  por_combustivel: { combustivel: string; litros: number; gasto: number; abastecimentos: number }[];
  veiculos: {
    veiculo_id: string;
    placa: string;
    modelo: string | null;
    patrimonio: string | null;
    secretaria: string | null;
    situacao: string;
    combustiveis: string[];
    hodometro: number;
    usa_horimetro: boolean;
    abastecimentos: number;
    litros: number;
    gasto: number;
    km_percorridos: number;
    consumo_km_l: number | null;
    custo_por_km: number | null;
  }[];
  alertas: {
    abastecimento_id: string;
    data: string;
    placa: string | null;
    motorista: string | null;
    local: string | null;
    litros: number;
    alertas: { codigo: string; descricao: string }[];
  }[];
  alertas_por_tipo: { codigo: string; descricao: string; quantidade: number }[];
  motoristas: {
    motorista_id: string;
    nome: string;
    matricula: string | null;
    cnh_categoria: string | null;
    cnh_validade: string | null;
    cnh_vencida: boolean;
    ativo: boolean;
    abastecimentos: number;
    litros: number;
    gasto: number;
    veiculos: string[];
    ultimo_abastecimento: string | null;
  }[];
  aviso: string;
}

export interface AcessoPortal {
  id: string;
  nome: string;
  email: string | null;
  login: string;
  bloqueado: boolean;
  deve_trocar_senha: boolean;
  ultimo_acesso: string | null;
  criado_em: string | null;
}

export interface PerfilAcesso {
  name: string;
  label: string;
  restrito_a_secretaria: boolean;
}

export interface AcessoUsuario {
  id: string;
  nome: string;
  email: string;
  ativo: boolean;
  perfis_plataforma: { name: string; label: string }[];
  /** Perfil definido no GovFrota; null = usa o papel vindo da plataforma. */
  perfil_local: string | null;
  perfis_efetivos: { name: string; label: string }[];
  cargo: string | null;
  secretarias: { id: string; nome: string }[];
  restrito: boolean;
}

/** Contrato/ata com o posto: preço por litro e saldo em litros (valores decimais vêm como string). */
export interface ContratoPosto {
  id: string;
  fornecedor_id: string;
  combustivel_id: string;
  combustivel_nome: string | null;
  numero: string | null;
  preco_litro: string;
  litros_contratados: string;
  litros_consumidos: string;
  saldo_litros: string;
  saldo_valor: string;
  data_inicio: string | null;
  data_fim: string | null;
  ativo: boolean;
  observacoes: string | null;
}

export interface FornecedorDetalhe extends Fornecedor {
  historico_entradas: EntradaHist[];
  historico_abastecimentos: {
    id: string; data: string; placa: string; litros: number; preco_litro: number | null;
    valor: number | null; nota: string | null; cancelado: boolean;
  }[];
  historico_manutencoes: { id: string; data: string; placa: string; tipo: string; status: string; valor: number }[];
}
export interface Unidade {
  id: string;
  nome: string;
  sigla: string | null;
  ativo: boolean;
  total_veiculos: number;
}
export interface AlertaAtual {
  tipo: string;
  severidade: "CRITICO" | "ALERTA" | "INFO" | string;
  titulo: string;
  descricao: string | null;
  link: string | null;
}
export interface Abastecimento {
  id: string;
  veiculo_id: string;
  motorista_id: string | null;
  modalidade?: "TANQUE_PROPRIO" | "POSTO_CREDENCIADO" | string;
  tanque_id: string | null;
  fornecedor_id?: string | null;
  unidade_id?: string | null;
  combustivel_id: string;
  quantidade_litros: string;
  quilometragem: number;
  horimetro?: string | null;
  consumo_l_h?: string | number | null;
  preco_litro?: string | null;
  numero_nf?: string | null;
  chave_nfe?: string | null;
  alertas?: string[];
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
  fornecedor_nome?: string | null;
  unidade_nome?: string | null;
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
  fornecedor_id: string | null;
  fornecedor_nome?: string | null;
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
    restante_horas?: number | null;
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
    dias_autonomia?: number | null;
  }[];
  /** Saldo contratado com os postos — preenchido só quando não há tanque próprio ativo. */
  contratos_posto?: {
    id: string;
    fornecedor_id: string;
    posto: string;
    combustivel: string;
    numero: string | null;
    preco_litro: number;
    litros_contratados: number;
    saldo_litros: number;
    saldo_valor: number;
    percentual: number | null;
    data_fim: string | null;
  }[];
  abastecimentos: {
    hoje_litros: number;
    hoje_quantidade: number;
    mes_litros: number;
    mes_gasto: number;
    mes_quantidade: number;
    com_alerta_7d?: number;
  };
  gasto_por_unidade_mes?: { unidade_id: string | null; unidade: string; gasto: number; litros: number }[];
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
    local?: string | null;
    unidade?: string | null;
    litros: number;
    km: number;
    horimetro?: number | null;
    numero_nf?: string | null;
    custo_total: number | null;
  }[];
}
export interface RelatorioSecretarias {
  periodo: { inicio: string; fim: string };
  total: number;
  itens: {
    unidade_id: string | null;
    unidade: string;
    veiculos: number;
    abastecimentos: number;
    litros: number;
    combustivel_tanque: number;
    combustivel_posto: number;
    combustivel_total: number;
    manutencao: number;
    total: number;
    participacao_pct: number;
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
    usa_horimetro?: boolean;
    horas_trabalhadas?: number | null;
    consumo_l_h?: number | null;
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
  entradas?: { id: string; numero_nota: string | null; litros: number }[];
  abastecimentos?: { id: string; numero_nf: string | null; placa: string; litros: number }[];
}
export interface Configuracoes {
  tipo_organizacao: string;
  foto_bomba_obrigatoria: boolean;
  foto_km_obrigatoria: boolean;
  exigir_tanque_cheio: boolean;
  permitir_retroativo: boolean;
  tolerancia_km_percentual: number;
  alerta_consumo_desvio_pct: number;
  alerta_litros_acima_media_pct: number;
  horario_abastecimento_inicio: string | null;
  horario_abastecimento_fim: string | null;
  bloquear_cnh_vencida: boolean;
  permitir_estoque_negativo: boolean;
  exigir_nf_entrada: boolean;
  exigir_fornecedor_entrada: boolean;
  alerta_estoque_minimo_dias: number;
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
  tipo?: string;
  titulo: string;
  descricao?: string | null;
  severidade: string;
  link?: string | null;
  lida: boolean;
  created_at: string;
}
