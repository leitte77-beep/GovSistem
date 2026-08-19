import type { Convenio, ConvenioListItem, Etapa, TimelineEvent, Anexo, Tarefa, TarefaListItem, Comentario, Contestacao, Notificacao, TemplateFluxo, Setor, Diligencia, Repasse, Medicao, MovimentoFinanceiro, ResumoFinanceiro, Contrato, Aditivo, Licitacao, Prestacao, EntregaObjeto, AuditoriaRegistro, Obra, DiarioObra, RegistroFoto } from "@/types/govtask";

const BASE_URL = "/api/govtask";
const ACCESS_TOKEN_KEY = "govtask_access_token";

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

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const isFormData = options.body instanceof FormData;
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { ...getHeaders(isFormData), ...(options.headers as Record<string, string> || {}) },
  });
  if (res.status === 401) {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    window.dispatchEvent(new Event("auth:logout"));
    throw new AuthError();
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  me() {
    return request<{ id: string; email: string; name: string; roles: { id: string; name: string; label: string }[] }>("/auth/me");
  },

  listConvenios(params?: { status?: string; tipo?: string; esfera?: string; categoria?: string; situacao?: string; search?: string; skip?: number; limit?: number }) {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.tipo) q.set("tipo", params.tipo);
    if (params?.esfera) q.set("esfera", params.esfera);
    if (params?.categoria) q.set("categoria", params.categoria);
    if (params?.situacao) q.set("situacao", params.situacao);
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

  listHistoricoPrazos(tarefaId: string) {
    return request<{ id: string; prazo_anterior: string | null; prazo_novo: string | null; definido_por_id: string; motivo: string | null; tipo: string; created_at: string }[]>(`/tarefas/${tarefaId}/historico-prazos`);
  },

  listDependencias(tarefaId: string) {
    return request<{ id: string; tarefa_id: string; depende_de_id: string; depende_de_titulo: string | null }[]>(`/tarefas/${tarefaId}/dependencias`);
  },

  criarDependencia(tarefaId: string, dependeDeId: string) {
    return request(`/tarefas/${tarefaId}/dependencias`, { method: "POST", body: JSON.stringify({ depende_de_id: dependeDeId }) });
  },

  removerDependencia(tarefaId: string, dependenciaId: string) {
    return request<void>(`/tarefas/${tarefaId}/dependencias/${dependenciaId}`, { method: "DELETE" });
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

  uploadAnexoAvancado(convenioId: string, file: File, opts: { tipo_documento?: string; categoria?: string; classificacao?: string; descricao?: string; motivo_versao?: string; etapa_id?: string; tarefa_id?: string; medicao_id?: string; prestacao_id?: string; diligencia_id?: string; entrega_id?: string }) {
    const fd = new FormData();
    fd.append("file", file);
    let url = `/anexos?convenio_id=${convenioId}&tipo_documento=${opts.tipo_documento || "OUTRO"}&categoria=${opts.categoria || "OUTROS"}&classificacao=${opts.classificacao || "INTERNO"}`;
    if (opts.descricao) url += `&descricao=${encodeURIComponent(opts.descricao)}`;
    if (opts.motivo_versao) url += `&motivo_versao=${encodeURIComponent(opts.motivo_versao)}`;
    if (opts.etapa_id) url += `&etapa_id=${opts.etapa_id}`;
    if (opts.tarefa_id) url += `&tarefa_id=${opts.tarefa_id}`;
    if (opts.medicao_id) url += `&medicao_id=${opts.medicao_id}`;
    if (opts.prestacao_id) url += `&prestacao_id=${opts.prestacao_id}`;
    if (opts.diligencia_id) url += `&diligencia_id=${opts.diligencia_id}`;
    if (opts.entrega_id) url += `&entrega_id=${opts.entrega_id}`;
    return request<Anexo>(url, { method: "POST", body: fd });
  },

  marcarAnexoEnviadoExterno(id: string, data: { sistema?: string; protocolo?: string; data?: string; observacao?: string }) {
    return request<Anexo>(`/anexos/${id}/enviar-externo`, { method: "POST", body: JSON.stringify(data) });
  },

  // ── Diligências ──
  listDiligencias(convenioId: string) {
    return request<Diligencia[]>(`/diligencias/convenios/${convenioId}`);
  },
  criarDiligencia(convenioId: string, data: Record<string, unknown>) {
    return request<Diligencia>(`/diligencias/convenios/${convenioId}`, { method: "POST", body: JSON.stringify(data) });
  },
  obterDiligencia(id: string) {
    return request<Diligencia>(`/diligencias/${id}`);
  },
  atualizarDiligencia(id: string, data: Record<string, unknown>) {
    return request<Diligencia>(`/diligencias/${id}`, { method: "PATCH", body: JSON.stringify(data) });
  },
  responderDiligencia(id: string, data: { resposta_interna: string; resposta_protocolo?: string }) {
    return request<Diligencia>(`/diligencias/${id}/responder`, { method: "POST", body: JSON.stringify(data) });
  },
  protocolarDiligencia(id: string, data: { resposta_interna?: string; resposta_protocolo: string }) {
    return request<Diligencia>(`/diligencias/${id}/protocolar`, { method: "POST", body: JSON.stringify(data) });
  },
  excluirDiligencia(id: string) {
    return request<void>(`/diligencias/${id}`, { method: "DELETE" });
  },

  // ── Repasses ──
  listRepasses(convenioId: string) {
    return request<Repasse[]>(`/convenios/${convenioId}/repasses`);
  },
  criarRepasse(convenioId: string, data: Record<string, unknown>) {
    return request<Repasse>(`/convenios/${convenioId}/repasses`, { method: "POST", body: JSON.stringify(data) });
  },
  receberRepasse(convenioId: string, repasseId: string, data: { valor_recebido: number; data_recebida?: string }) {
    return request<Repasse>(`/convenios/${convenioId}/repasses/${repasseId}/receber`, { method: "POST", body: JSON.stringify(data) });
  },
  atualizarRepasse(convenioId: string, repasseId: string, data: Record<string, unknown>) {
    return request<Repasse>(`/convenios/${convenioId}/repasses/${repasseId}`, { method: "PATCH", body: JSON.stringify(data) });
  },
  excluirRepasse(convenioId: string, repasseId: string) {
    return request<void>(`/convenios/${convenioId}/repasses/${repasseId}`, { method: "DELETE" });
  },

  // ── Medições ──
  listMedicoes(convenioId: string) {
    return request<Medicao[]>(`/convenios/${convenioId}/medicoes`);
  },
  criarMedicao(convenioId: string, data: Record<string, unknown>) {
    return request<Medicao>(`/convenios/${convenioId}/medicoes`, { method: "POST", body: JSON.stringify(data) });
  },
  aprovarMedicao(convenioId: string, medicaoId: string) {
    return request<Medicao>(`/convenios/${convenioId}/medicoes/${medicaoId}/aprovar`, { method: "POST" });
  },
  atualizarMedicao(convenioId: string, medicaoId: string, data: Record<string, unknown>) {
    return request<Medicao>(`/convenios/${convenioId}/medicoes/${medicaoId}`, { method: "PATCH", body: JSON.stringify(data) });
  },
  excluirMedicao(convenioId: string, medicaoId: string) {
    return request<void>(`/convenios/${convenioId}/medicoes/${medicaoId}`, { method: "DELETE" });
  },

  // ── Financeiro ──
  resumoFinanceiro(convenioId: string) {
    return request<ResumoFinanceiro>(`/convenios/${convenioId}/financeiro/resumo`);
  },
  listMovimentos(convenioId: string) {
    return request<MovimentoFinanceiro[]>(`/convenios/${convenioId}/financeiro/movimentos`);
  },
  criarMovimento(convenioId: string, data: Record<string, unknown>) {
    return request<MovimentoFinanceiro>(`/convenios/${convenioId}/financeiro/movimentos`, { method: "POST", body: JSON.stringify(data) });
  },
  excluirMovimento(convenioId: string, movimentoId: string) {
    return request<void>(`/convenios/${convenioId}/financeiro/movimentos/${movimentoId}`, { method: "DELETE" });
  },

  // ── Contratos ──
  listContratos(convenioId: string) {
    return request<Contrato[]>(`/convenios/${convenioId}/contratos`);
  },
  criarContrato(convenioId: string, data: Record<string, unknown>) {
    return request<Contrato>(`/convenios/${convenioId}/contratos`, { method: "POST", body: JSON.stringify(data) });
  },
  atualizarContrato(convenioId: string, contratoId: string, data: Record<string, unknown>) {
    return request<Contrato>(`/convenios/${convenioId}/contratos/${contratoId}`, { method: "PATCH", body: JSON.stringify(data) });
  },
  excluirContrato(convenioId: string, contratoId: string) {
    return request<void>(`/convenios/${convenioId}/contratos/${contratoId}`, { method: "DELETE" });
  },
  criarAditivo(convenioId: string, contratoId: string, data: Record<string, unknown>) {
    return request<Aditivo>(`/convenios/${convenioId}/contratos/${contratoId}/aditivos`, { method: "POST", body: JSON.stringify(data) });
  },

  // ── Licitações ──
  listLicitacoes(convenioId: string) {
    return request<Licitacao[]>(`/convenios/${convenioId}/licitacoes`);
  },
  criarLicitacao(convenioId: string, data: Record<string, unknown>) {
    return request<Licitacao>(`/convenios/${convenioId}/licitacoes`, { method: "POST", body: JSON.stringify(data) });
  },
  atualizarLicitacao(convenioId: string, licitacaoId: string, data: Record<string, unknown>) {
    return request<Licitacao>(`/convenios/${convenioId}/licitacoes/${licitacaoId}`, { method: "PATCH", body: JSON.stringify(data) });
  },
  excluirLicitacao(convenioId: string, licitacaoId: string) {
    return request<void>(`/convenios/${convenioId}/licitacoes/${licitacaoId}`, { method: "DELETE" });
  },

  // ── Prestações de Contas ──
  listPrestacoes(convenioId: string) {
    return request<Prestacao[]>(`/convenios/${convenioId}/prestacoes`);
  },
  criarPrestacao(convenioId: string, data: Record<string, unknown>) {
    return request<Prestacao>(`/convenios/${convenioId}/prestacoes`, { method: "POST", body: JSON.stringify(data) });
  },
  adicionarItemPrestacao(convenioId: string, prestacaoId: string, descricao: string) {
    return request(`/convenios/${convenioId}/prestacoes/${prestacaoId}/itens`, { method: "POST", body: JSON.stringify({ descricao }) });
  },
  alternarItemPrestacao(convenioId: string, prestacaoId: string, itemId: string, conferido: boolean) {
    return request(`/convenios/${convenioId}/prestacoes/${prestacaoId}/itens/${itemId}`, { method: "PATCH", body: JSON.stringify({ conferido }) });
  },
  enviarPrestacao(convenioId: string, prestacaoId: string, data: Record<string, unknown>) {
    return request<Prestacao>(`/convenios/${convenioId}/prestacoes/${prestacaoId}/enviar`, { method: "POST", body: JSON.stringify(data) });
  },
  decidirPrestacao(convenioId: string, prestacaoId: string, data: { status: string; parecer?: string }) {
    return request<Prestacao>(`/convenios/${convenioId}/prestacoes/${prestacaoId}/decidir`, { method: "POST", body: JSON.stringify(data) });
  },
  excluirPrestacao(convenioId: string, prestacaoId: string) {
    return request<void>(`/convenios/${convenioId}/prestacoes/${prestacaoId}`, { method: "DELETE" });
  },

  // ── Entregas de Objetos ──
  listEntregas(convenioId: string) {
    return request<EntregaObjeto[]>(`/convenios/${convenioId}/entregas`);
  },
  criarEntrega(convenioId: string, data: Record<string, unknown>) {
    return request<EntregaObjeto>(`/convenios/${convenioId}/entregas`, { method: "POST", body: JSON.stringify(data) });
  },
  atualizarEntrega(convenioId: string, entregaId: string, data: Record<string, unknown>) {
    return request<EntregaObjeto>(`/convenios/${convenioId}/entregas/${entregaId}`, { method: "PATCH", body: JSON.stringify(data) });
  },
  excluirEntrega(convenioId: string, entregaId: string) {
    return request<void>(`/convenios/${convenioId}/entregas/${entregaId}`, { method: "DELETE" });
  },

  // ── Auditoria ──
  listAuditoria(convenioId?: string) {
    const q = convenioId ? `?convenio_id=${convenioId}` : "";
    return request<AuditoriaRegistro[]>(`/auditoria${q}`);
  },

  // ── Favoritos ──
  listFavoritos() {
    return request<{ id: string; titulo: string; tipo: string; status: string }[]>("/processos/favoritos");
  },
  favoritar(convenioId: string) {
    return request<void>(`/processos/${convenioId}/favoritar`, { method: "POST" });
  },
  desfavoritar(convenioId: string) {
    return request<void>(`/processos/${convenioId}/favoritar`, { method: "DELETE" });
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

  // ── Escalonamento de atrasos (§59) ──
  getEscalonamento() {
    return request<{ ativo: boolean; dia_responsavel: number; dia_coordenador: number; dia_gestor: number }>("/admin/escalonamento");
  },
  updateEscalonamento(data: { ativo: boolean; dia_responsavel: number; dia_coordenador: number; dia_gestor: number }) {
    return request<{ ativo: boolean; dia_responsavel: number; dia_coordenador: number; dia_gestor: number }>("/admin/escalonamento", { method: "PUT", body: JSON.stringify(data) });
  },
  verificarEscalonamento() {
    return request<{ notificacoes_criadas: number; escalonadas: number }>("/admin/escalonamento/verificar", { method: "POST" });
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

  // ── Relatórios ──
  listarAlertas() {
    return request<{ alertas: { categoria: string; severidade: string; titulo: string; descricao: string; processo_id: string; processo: string; link: string | null }[]; riscos: { processo_id: string; processo: string; nivel: string; score: number; motivos: string[]; sem_movimentacao_dias: number | null; link: string }[] }>("/alertas");
  },
  relatorioResumo() {
    return request<{ total_processos: number; total_aprovado: number; total_captado: number; em_andamento: number; concluidos: number; em_diligencia: number; rascunho: number; por_categoria: Record<string, number>; por_esfera: Record<string, number> }>("/relatorios/resumo");
  },
  relatorioObras() {
    return request<{ total_obras: number; em_andamento: number; concluidas: number; atrasadas: number; obras: { id: string; convenio_id: string; convenio_titulo: string | null; nome: string; empresa: string; percentual_fisico: number | null; percentual_financeiro: number | null; previsao_conclusao: string | null; valor_contrato: number | null; situacao: string }[] }>("/relatorios/obras");
  },
  relatorioPrestacoes() {
    return request<{ total_prestacoes: number; pendentes: number; aprovadas: number; prestacoes: { id: string; convenio_id: string; convenio_titulo: string | null; titulo: string; status: string; protocolo: string }[] }>("/relatorios/prestacoes");
  },
  dossieProcesso(convenioId: string) {
    return request<Record<string, unknown>>(`/relatorios/dossie/${convenioId}`);
  },

  // ── Obras / Engenharia ──
  listObras(convenioId: string) {
    return request<Obra[]>(`/convenios/${convenioId}/obras`);
  },
  criarObra(convenioId: string, data: Record<string, unknown>) {
    return request<Obra>(`/convenios/${convenioId}/obras`, { method: "POST", body: JSON.stringify(data) });
  },
  atualizarObra(convenioId: string, obraId: string, data: Record<string, unknown>) {
    return request<Obra>(`/convenios/${convenioId}/obras/${obraId}`, { method: "PATCH", body: JSON.stringify(data) });
  },
  excluirObra(convenioId: string, obraId: string) {
    return request<void>(`/convenios/${convenioId}/obras/${obraId}`, { method: "DELETE" });
  },
  adicionarCronograma(convenioId: string, obraId: string, data: Record<string, unknown>) {
    return request<Obra>(`/convenios/${convenioId}/obras/${obraId}/cronograma`, { method: "POST", body: JSON.stringify(data) });
  },
  atualizarCronograma(convenioId: string, obraId: string, itemId: string, data: Record<string, unknown>) {
    return request<Obra>(`/convenios/${convenioId}/obras/${obraId}/cronograma/${itemId}`, { method: "PATCH", body: JSON.stringify(data) });
  },
  listDiario(convenioId: string, obraId: string) {
    return request<DiarioObra[]>(`/convenios/${convenioId}/obras/${obraId}/diario`);
  },
  registrarDiario(convenioId: string, obraId: string, data: Record<string, unknown>) {
    return request<DiarioObra>(`/convenios/${convenioId}/obras/${obraId}/diario`, { method: "POST", body: JSON.stringify(data) });
  },
  listFotos(convenioId: string, obraId: string) {
    return request<RegistroFoto[]>(`/convenios/${convenioId}/obras/${obraId}/fotos`);
  },
  registrarFoto(convenioId: string, obraId: string, data: Record<string, unknown>) {
    return request<RegistroFoto>(`/convenios/${convenioId}/obras/${obraId}/fotos`, { method: "POST", body: JSON.stringify(data) });
  },
};

export { AuthError };
