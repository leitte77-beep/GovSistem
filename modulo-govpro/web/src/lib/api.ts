import type {
  AcessoExternoOut,
  AcompanhamentoOut,
  AndamentoOut,
  AssinaturaOut,
  AuditoriaEvento,
  AuditoriaFiltro,
  BlocoAssinaturaDetalhe,
  BlocoAssinaturaOut,
  CaixaAba,
  CicloArquivisticoOut,
  CidadaoPendente,
  CredencialAcessoOut,
  DocumentoCreate,
  DocumentoOut,
  Feriado,
  HipoteseLegal,
  HipoteseLegalInput,
  HipoteseLegalUpdate,
  Indisponibilidade,
  IndisponibilidadeInput,
  IntimacaoOut,
  InteressadoOut,
  MatrizAssinaturaUpdate,
  ManifestacaoOut,
  ModeloDocumento,
  ModeloDocumentoInput,
  ModeloDocumentoUpdate,
  ModeloPadraoResult,
  MotivoSobrestamento,
  MotivoSobrestamentoInput,
  MotivoSobrestamentoUpdate,
  PlanoClassificacao,
  PlanoClassificacaoInput,
  PlanoClassificacaoUpdate,
  PrazoCreate,
  PrazoItem,
  ProcessoAutuarInput,
  ProcessoOut,
  RenderModeloResult,
  RenderTextoResult,
  TextoPadrao,
  TextoPadraoInput,
  TextoPadraoUpdate,
  TipoDocumento,
  TipoDocumentoInput,
  TipoDocumentoUpdate,
  TipoProcesso,
  TipoProcessoInput,
  TipoProcessoUpdate,
  TtdItem,
  TramitacaoCaixaOut,
  TramitacaoCreate,
  TramitacaoOut,
  Unidade,
  UnidadeInput,
  UnidadeUpdate,
} from "@/types/govpro";

const BASE_URL = "/api/govpro/v1";

export const SAAS_URL =
  process.env.NEXT_PUBLIC_SAAS_URL || "https://admin.govsistem.com.br";

export class AuthError extends Error {
  constructor() {
    super("Not authenticated");
    this.name = "AuthError";
  }
}

export interface MeResponse {
  id: string;
  name: string;
  email: string;
  organization_id: string | null;
  roles: string[];
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  bootstrapTokenFromQuery();
  return sessionStorage.getItem("govpro_access_token");
}

export function bootstrapTokenFromQuery(): string | null {
  if (typeof window === "undefined") return null;
  const urlParams = new URLSearchParams(window.location.search);
  const urlToken = urlParams.get("token");
  if (urlToken) {
    sessionStorage.setItem("govpro_access_token", urlToken);
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
    headers: { ...getHeaders(isFormData), ...(options.headers ?? {}) },
  });

  if (res.status === 401) {
    sessionStorage.removeItem("govpro_access_token");
    if (typeof window !== "undefined") window.dispatchEvent(new Event("auth:logout"));
    throw new AuthError();
  }

  if (!res.ok) {
    const err = (await res.json().catch(() => ({ detail: "Erro desconhecido" }))) as {
      detail?: string;
    };
    throw new Error(err.detail || `HTTP ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  me() {
    return request<MeResponse>("/me");
  },

  // Catálogos
  listTiposProcesso() {
    return request<TipoProcesso[]>("/dominio/tipos-processo");
  },
  listTiposDocumento() {
    return request<TipoDocumento[]>("/dominio/tipos-documento");
  },
  listUnidades() {
    return request<Unidade[]>("/dominio/unidades");
  },
  listHipotesesLegais() {
    return request<HipoteseLegal[]>("/dominio/hipoteses-legais");
  },
  listPlanoClassificacao() {
    return request<PlanoClassificacao[]>("/dominio/plano-classificacao");
  },
  listMotivosSobrestamento() {
    return request<MotivoSobrestamento[]>("/dominio/motivos-sobrestamento");
  },
  listModelosDocumento() {
    return request<ModeloDocumento[]>("/dominio/modelos-documento");
  },
  listTextosPadrao() {
    return request<TextoPadrao[]>("/dominio/textos-padrao");
  },
  renderModeloDocumento(modeloId: string, processoId: string) {
    const q = new URLSearchParams({ processo_id: processoId });
    return request<RenderModeloResult>(`/dominio/modelos-documento/${modeloId}/render?${q.toString()}`);
  },
  renderTextoPadrao(textoId: string, processoId: string) {
    const q = new URLSearchParams({ processo_id: processoId });
    return request<RenderTextoResult>(`/dominio/textos-padrao/${textoId}/render?${q.toString()}`);
  },
  modeloPadraoTipo(tipoDocumentoId: string, processoId: string) {
    const q = new URLSearchParams({ processo_id: processoId });
    return request<ModeloPadraoResult>(`/dominio/tipos-documento/${tipoDocumentoId}/modelo-padrao?${q.toString()}`);
  },

  // Processos
  listProcessos(params?: {
    q?: string;
    tipo_processo_id?: string;
    situacao?: string;
    nivel_acesso?: string;
    data_inicio?: string;
    data_fim?: string;
    skip?: number;
    limit?: number;
  }) {
    const q = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== "") q.set(k, String(v));
      });
    }
    const qs = q.toString();
    return request<ProcessoOut[]>(`/processos${qs ? `?${qs}` : ""}`);
  },
  getProcesso(id: string) {
    return request<ProcessoOut>(`/processos/${id}`);
  },
  criarProcesso(data: ProcessoAutuarInput) {
    return request<ProcessoOut>("/processos", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  listAndamentos(processoId: string) {
    return request<AndamentoOut[]>(`/processos/${processoId}/andamentos`);
  },
  listInteressados(processoId: string) {
    return request<InteressadoOut[]>(`/processos/${processoId}/interessados`);
  },
  concluirProcesso(processoId: string, motivo?: string) {
    const q = new URLSearchParams();
    if (motivo) q.set("motivo", motivo);
    const qs = q.toString();
    return request<ProcessoOut>(`/processos/${processoId}/concluir${qs ? `?${qs}` : ""}`, {
      method: "POST",
    });
  },
  arquivarProcesso(processoId: string, motivo?: string) {
    const q = new URLSearchParams();
    if (motivo) q.set("motivo", motivo);
    const qs = q.toString();
    return request<ProcessoOut>(`/processos/${processoId}/arquivar${qs ? `?${qs}` : ""}`, {
      method: "POST",
    });
  },
  reabrirProcesso(processoId: string, motivo?: string) {
    const q = new URLSearchParams();
    if (motivo) q.set("motivo", motivo);
    const qs = q.toString();
    return request<ProcessoOut>(`/processos/${processoId}/reabrir${qs ? `?${qs}` : ""}`, {
      method: "POST",
    });
  },
  atribuirProcesso(processoId: string, usuarioId: string | null) {
    return request<ProcessoOut>(`/processos/${processoId}/atribuir`, {
      method: "PATCH",
      body: JSON.stringify({ usuario_id: usuarioId }),
    });
  },

  // Minha Caixa
  minhaCaixa(aba: CaixaAba) {
    return request<(ProcessoOut | TramitacaoCaixaOut)[]>(`/minha-caixa/${aba}`);
  },

  // Documentos
  criarDocumento(processoId: string, data: DocumentoCreate) {
    return request<DocumentoOut>(`/processos/${processoId}/documentos`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  listDocumentos(processoId: string) {
    return request<DocumentoOut[]>(`/processos/${processoId}/documentos`);
  },
  editarDocumento(documentoId: string, conteudo_html: string, titulo?: string) {
    return request<DocumentoOut>(`/documentos/${documentoId}`, {
      method: "PATCH",
      body: JSON.stringify({ conteudo_html, titulo }),
    });
  },
  assinarDocumento(documentoId: string, papel_cargo?: string) {
    return request<AssinaturaOut>(`/documentos/${documentoId}/assinar`, {
      method: "POST",
      body: JSON.stringify({ papel_cargo, nivel: "SIMPLES" }),
    });
  },
  downloadDocumento(documentoId: string) {
    return `${BASE_URL}/documentos/${documentoId}/download`;
  },

  // Tramitações
  tramitar(processoId: string, data: TramitacaoCreate) {
    return request<TramitacaoOut[]>(`/processos/${processoId}/tramitacoes`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  listTramitacoes(processoId: string) {
    return request<TramitacaoOut[]>(`/processos/${processoId}/tramitacoes`);
  },
  receber(tramitacaoId: string) {
    return request<TramitacaoOut>(`/tramitacoes/${tramitacaoId}/receber`, { method: "POST" });
  },
  devolver(processoId: string, data: { unidade_origem_id: string; unidade_destino_id: string; motivo: string }) {
    return request<TramitacaoOut>(`/processos/${processoId}/devolver`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  // Sigilo
  classificar(alvoTipo: "processo" | "documento", alvoId: string, data: {
    grau?: string | null;
    hipotese_legal_id?: string | null;
    prazo_anos?: number | null;
    justificativa?: string | null;
  }) {
    return request<unknown>(`/${alvoTipo}/${alvoId}/classificar`, {
      method: "POST",
      body: JSON.stringify({ alvo_tipo: alvoTipo, ...data }),
    });
  },
  desclassificar(alvoTipo: "processo" | "documento", alvoId: string, justificativa: string) {
    return request<unknown>(`/${alvoTipo}/${alvoId}/desclassificar`, {
      method: "POST",
      body: JSON.stringify({ justificativa }),
    });
  },

  // Credenciais de acesso nominal (need-to-know)
  listCredenciais(processoId: string) {
    return request<CredencialAcessoOut[]>(`/processos/${processoId}/credenciais`);
  },
  concederCredencial(processoId: string, usuarioId: string, motivo?: string) {
    return request<{ id: string }>(`/processos/${processoId}/credenciais`, {
      method: "POST",
      body: JSON.stringify({ usuario_id: usuarioId, motivo: motivo || null }),
    });
  },
  revogarCredencial(processoId: string, usuarioId: string) {
    return request<void>(`/processos/${processoId}/credenciais/${usuarioId}`, { method: "DELETE" });
  },

  // Ciclo arquivístico
  obterCiclo(processoId: string) {
    return request<CicloArquivisticoOut>(`/processos/${processoId}/ciclo`);
  },
  transferirProcesso(processoId: string) {
    return request<{ processo_id: string; fase: string }>(`/processos/${processoId}/transferir`, {
      method: "POST",
    });
  },
  recolherProcesso(processoId: string) {
    return request<{ processo_id: string; fase: string }>(`/processos/${processoId}/recolher`, {
      method: "POST",
    });
  },

  // Intimações
  listIntimacoes(processoId: string) {
    return request<IntimacaoOut[]>(`/processos/${processoId}/intimacoes`);
  },
  criarIntimacao(processoId: string, data: { destinatario_nome: string; texto: string; prazo_dias: number }) {
    return request<{ id: string; status: string }>(`/processos/${processoId}/intimacoes`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  // Acesso externo
  listAcessosExternos(processoId: string) {
    return request<AcessoExternoOut[]>(`/processos/${processoId}/acessos-externos`);
  },
  concederAcessoExterno(processoId: string, data: { email_externo?: string; expira_em?: string | null }) {
    return request<{ id: string }>(`/processos/${processoId}/acesso-externo`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  revogarAcessoExterno(acessoId: string) {
    return request<void>(`/acessos-externos/${acessoId}`, { method: "DELETE" });
  },

  // Acompanhamento especial (favoritos)
  listAcompanhamentos() {
    return request<AcompanhamentoOut[]>("/acompanhamentos");
  },
  marcarAcompanhamento(processoId: string, etiqueta?: string) {
    return request<AcompanhamentoOut>("/acompanhamentos", {
      method: "POST",
      body: JSON.stringify({ processo_id: processoId, etiqueta: etiqueta || null }),
    });
  },
  desmarcarAcompanhamento(processoId: string) {
    return request<void>(`/acompanhamentos/${processoId}`, { method: "DELETE" });
  },

  // Prazos
  meusPrazos(vencidos = false) {
    return request<PrazoItem[]>(`/meus-prazos?vencidos=${vencidos}`);
  },
  criarPrazo(processoId: string, data: PrazoCreate) {
    return request<{ id: string; data_vencimento: string }>(`/processos/${processoId}/prazos`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  prorrogarPrazo(prazoId: string, novos_dias: number, motivo: string) {
    return request<{ id: string; data_vencimento: string }>(`/prazos/${prazoId}/prorrogar`, {
      method: "POST",
      body: JSON.stringify({ novos_dias, motivo }),
    });
  },

  // Sobrestamento
  sobrestar(processoId: string, data: { motivo_texto: string; motivo_id?: string | null }) {
    return request<{ id: string; processo_id: string; ativo: boolean }>(
      `/processos/${processoId}/sobrestar`,
      { method: "POST", body: JSON.stringify(data) }
    );
  },
  reativar(processoId: string) {
    return request<{ processo_id: string; situacao: string }>(`/processos/${processoId}/reativar`, {
      method: "POST",
    });
  },

  // Feriados
  listFeriados(ano?: number) {
    const qs = ano ? `?ano=${ano}` : "";
    return request<Feriado[]>(`/feriados${qs}`);
  },
  criarFeriado(data: { data: string; nome: string; escopo: string; ponto_facultativo?: boolean }) {
    return request<{ id: string; data: string; nome: string }>("/feriados", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  removerFeriado(data: string) {
    return request<{ removido: string }>(`/feriados/${data}`, { method: "DELETE" });
  },

  // Arquivo / TTD
  listTtd() {
    return request<TtdItem[]>("/ttd");
  },
  dadosAbertos() {
    return request<Record<string, unknown>>("/dados-abertos");
  },

  buscarGlobal(q: string) {
    const params = new URLSearchParams({ q });
    return request<ProcessoOut[]>(`/busca?${params.toString()}`);
  },

  // Administração — Catálogos (Fase 6)
  criarTipoProcesso(data: TipoProcessoInput) {
    return request<TipoProcesso>("/dominio/tipos-processo", { method: "POST", body: JSON.stringify(data) });
  },
  atualizarTipoProcesso(id: string, data: TipoProcessoUpdate) {
    return request<TipoProcesso>(`/dominio/tipos-processo/${id}`, { method: "PATCH", body: JSON.stringify(data) });
  },
  removerTipoProcesso(id: string) {
    return request<void>(`/dominio/tipos-processo/${id}`, { method: "DELETE" });
  },

  criarTipoDocumento(data: TipoDocumentoInput) {
    return request<TipoDocumento>("/dominio/tipos-documento", { method: "POST", body: JSON.stringify(data) });
  },
  atualizarTipoDocumento(id: string, data: TipoDocumentoUpdate) {
    return request<TipoDocumento>(`/dominio/tipos-documento/${id}`, { method: "PATCH", body: JSON.stringify(data) });
  },
  removerTipoDocumento(id: string) {
    return request<void>(`/dominio/tipos-documento/${id}`, { method: "DELETE" });
  },

  criarUnidade(data: UnidadeInput) {
    return request<Unidade>("/dominio/unidades", { method: "POST", body: JSON.stringify(data) });
  },
  atualizarUnidade(id: string, data: UnidadeUpdate) {
    return request<Unidade>(`/dominio/unidades/${id}`, { method: "PATCH", body: JSON.stringify(data) });
  },
  removerUnidade(id: string) {
    return request<void>(`/dominio/unidades/${id}`, { method: "DELETE" });
  },

  criarHipoteseLegal(data: HipoteseLegalInput) {
    return request<HipoteseLegal>("/dominio/hipoteses-legais", { method: "POST", body: JSON.stringify(data) });
  },
  atualizarHipoteseLegal(id: string, data: HipoteseLegalUpdate) {
    return request<HipoteseLegal>(`/dominio/hipoteses-legais/${id}`, { method: "PATCH", body: JSON.stringify(data) });
  },
  removerHipoteseLegal(id: string) {
    return request<void>(`/dominio/hipoteses-legais/${id}`, { method: "DELETE" });
  },

  criarClasse(data: PlanoClassificacaoInput) {
    return request<PlanoClassificacao>("/dominio/plano-classificacao", { method: "POST", body: JSON.stringify(data) });
  },
  atualizarClasse(id: string, data: PlanoClassificacaoUpdate) {
    return request<PlanoClassificacao>(`/dominio/plano-classificacao/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  removerClasse(id: string) {
    return request<void>(`/dominio/plano-classificacao/${id}`, { method: "DELETE" });
  },

  criarMotivoSobrestamento(data: MotivoSobrestamentoInput) {
    return request<MotivoSobrestamento>("/dominio/motivos-sobrestamento", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  atualizarMotivoSobrestamento(id: string, data: MotivoSobrestamentoUpdate) {
    return request<MotivoSobrestamento>(`/dominio/motivos-sobrestamento/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  removerMotivoSobrestamento(id: string) {
    return request<void>(`/dominio/motivos-sobrestamento/${id}`, { method: "DELETE" });
  },

  criarModeloDocumento(data: ModeloDocumentoInput) {
    return request<ModeloDocumento>("/dominio/modelos-documento", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  atualizarModeloDocumento(id: string, data: ModeloDocumentoUpdate) {
    return request<ModeloDocumento>(`/dominio/modelos-documento/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  removerModeloDocumento(id: string) {
    return request<void>(`/dominio/modelos-documento/${id}`, { method: "DELETE" });
  },

  criarTextoPadrao(data: TextoPadraoInput) {
    return request<TextoPadrao>("/dominio/textos-padrao", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  atualizarTextoPadrao(id: string, data: TextoPadraoUpdate) {
    return request<TextoPadrao>(`/dominio/textos-padrao/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  removerTextoPadrao(id: string) {
    return request<void>(`/dominio/textos-padrao/${id}`, { method: "DELETE" });
  },

  // Matriz de assinaturas
  listMatrizAssinaturas() {
    return request<TipoDocumento[]>("/matriz-assinaturas");
  },
  atualizarMatrizAssinatura(tipoDocumentoId: string, data: MatrizAssinaturaUpdate) {
    return request<TipoDocumento>(`/matriz-assinaturas/${tipoDocumentoId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  // Blocos de assinatura
  listBlocosAssinatura() {
    return request<BlocoAssinaturaOut[]>("/blocos-assinatura");
  },
  detalharBlocoAssinatura(id: string) {
    return request<BlocoAssinaturaDetalhe>(`/blocos-assinatura/${id}`);
  },
  criarBlocoAssinatura(nome: string) {
    return request<{ id: string; nome: string }>("/blocos-assinatura", {
      method: "POST",
      body: JSON.stringify({ nome }),
    });
  },
  adicionarDocumentoAoBloco(blocoId: string, documentoId: string, ordem = 0) {
    return request<{ bloco_id: string; documento_id: string }>(`/blocos-assinatura/${blocoId}/documentos`, {
      method: "POST",
      body: JSON.stringify({ documento_id: documentoId, ordem }),
    });
  },
  assinarBloco(blocoId: string, papelCargo?: string) {
    return request<unknown>(`/blocos-assinatura/${blocoId}/assinar`, {
      method: "POST",
      body: JSON.stringify({ papel_cargo: papelCargo, nivel: "SIMPLES" }),
    });
  },

  // Cidadãos (aprovação de cadastro externo)
  listCidadaosPendentes() {
    return request<CidadaoPendente[]>("/cidadaos/pendentes");
  },
  aprovarCidadao(id: string) {
    return request<{ id: string; aprovado: boolean }>(`/cidadaos/${id}/aprovar`, { method: "POST" });
  },

  // Manifestações (ouvidoria)
  listManifestacoes() {
    return request<ManifestacaoOut[]>("/manifestacoes");
  },

  // Indisponibilidades
  listIndisponibilidades() {
    return request<Indisponibilidade[]>("/indisponibilidades");
  },
  registrarIndisponibilidade(data: IndisponibilidadeInput) {
    return request<{ id: string; encerrada: boolean }>("/indisponibilidades", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  encerrarIndisponibilidade(id: string, fim: string) {
    return request<{ id: string; encerrada: boolean }>(`/indisponibilidades/${id}/encerrar`, {
      method: "POST",
      body: JSON.stringify({ fim }),
    });
  },
  certidaoIndisponibilidade(id: string) {
    return request<Record<string, unknown>>(`/indisponibilidades/${id}/certidao`);
  },

  // Auditoria
  listAuditoria(filtro?: AuditoriaFiltro) {
    const q = new URLSearchParams();
    if (filtro) {
      Object.entries(filtro).forEach(([k, v]) => {
        if (v !== undefined && v !== "") q.set(k, String(v));
      });
    }
    const qs = q.toString();
    return request<AuditoriaEvento[]>(`/auditoria${qs ? `?${qs}` : ""}`);
  },
};
