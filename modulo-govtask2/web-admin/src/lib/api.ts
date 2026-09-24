/**
 * Cliente da API do GovTask.
 *
 * Um arquivo, um BASE_URL, um lugar onde o token é lido. A versão anterior
 * do módulo tinha dezenas de módulos de acesso e nenhum era o único.
 */

const BASE_URL = "/api/govtask";
const TOKEN_KEY = "govtask_token";

/** Portal da plataforma: é para onde o usuário volta ao sair. */
export const SAAS_URL =
  process.env.NEXT_PUBLIC_SAAS_URL || "https://app.govsistem.com.br";

export class ErroAutenticacao extends Error {
  constructor() {
    super("Sessão expirada");
    this.name = "ErroAutenticacao";
  }
}

/** O SSO da plataforma entrega o token na query string; guardamos e limpamos a URL. */
function capturarTokenDaUrl(): string | null {
  if (typeof window === "undefined") return null;
  const daUrl = new URLSearchParams(window.location.search).get("token");
  if (daUrl) {
    localStorage.setItem(TOKEN_KEY, daUrl);
    window.history.replaceState({}, "", window.location.pathname);
    return daUrl;
  }
  return null;
}

export function obterToken(): string | null {
  if (typeof window === "undefined") return null;
  capturarTokenDaUrl();
  return localStorage.getItem(TOKEN_KEY);
}

export function encerrarSessao() {
  localStorage.removeItem(TOKEN_KEY);
  window.dispatchEvent(new Event("govtask:sair"));
}

async function requisicao<T>(caminho: string, opcoes: RequestInit = {}): Promise<T> {
  const ehFormData = opcoes.body instanceof FormData;
  const cabecalhos: Record<string, string> = {};
  if (!ehFormData) cabecalhos["Content-Type"] = "application/json";
  const token = obterToken();
  if (token) cabecalhos["Authorization"] = `Bearer ${token}`;

  const resposta = await fetch(`${BASE_URL}${caminho}`, {
    ...opcoes,
    headers: { ...cabecalhos, ...((opcoes.headers as Record<string, string>) || {}) },
  });

  if (resposta.status === 401) {
    encerrarSessao();
    throw new ErroAutenticacao();
  }
  if (!resposta.ok) {
    const erro = await resposta.json().catch(() => ({ detail: "Erro inesperado." }));
    throw new Error(erro.detail || `HTTP ${resposta.status}`);
  }
  if (resposta.status === 204) return undefined as T;
  return resposta.json();
}

// ── Tipos ────────────────────────────────────────────────────────────────

export type TipoPedido = "AQUISICAO" | "OBRA" | "OUTRO";
export type Situacao =
  | "COM_ASSESSOR"
  | "EM_SETOR"
  | "AGUARDANDO_TERCEIRO"
  | "CONCLUIDO"
  | "CANCELADO";
export type StatusEncaminhamento =
  | "AGUARDANDO"
  | "EM_EXECUCAO"
  | "AGUARDANDO_COMPLEMENTO"
  | "CONCLUIDO"
  | "CANCELADO";
export type CategoriaAnexo = "DOCUMENTO" | "FOTO";
export type Saude = "NORMAL" | "ATENCAO" | "CRITICA";
export type TipoNotificacao =
  | "PEDIDO_ASSUMIDO"
  | "PEDIDO_TRANSFERIDO"
  | "PEDIDO_DEVOLVIDO"
  | "COMPLEMENTO_SOLICITADO"
  | "PRAZO_ALTERADO"
  | "MENCAO"
  | "RESUMO_DIARIO"
  | "TAREFA_RECEBIDA"
  | "TAREFA_LIBERADA";
export type MotivoParada =
  | "DOCUMENTO"
  | "GOVERNO"
  | "LICITACAO"
  | "RECURSO"
  | "ASSINATURA"
  | "OUTRO";

export interface UsuarioResumo {
  id: string;
  name: string;
  email: string;
  setor: string | null;
}

export type PerfilGovtask = "PREFEITO" | "ASSESSOR" | "DEPARTAMENTO" | "CONSULTA";

export interface UsuarioAdmin extends UsuarioResumo {
  papeis: string[];
  perfil: PerfilGovtask;
  perfil_definido: PerfilGovtask | null;
  ativo: boolean;
  ultimo_acesso: string | null;
  tarefas_abertas: number;
}

export interface RegistroAuditoria {
  id: string;
  autor_nome: string;
  alvo_tipo: "USUARIO" | "SETOR" | "AJUSTES";
  alvo_nome: string;
  campo: string;
  antes: string | null;
  depois: string | null;
  created_at: string;
}

export interface Setor {
  id: string;
  codigo: string;
  nome: string;
  ativo: boolean;
  sistema: boolean;
  prazo_dias: number | null;
  prazo_sugerido_dias: number;
  responsavel_id: string | null;
  pessoas: number;
  abertos: number;
}

export interface Anexo {
  id: string;
  encaminhamento_id: string | null;
  medicao_id: string | null;
  categoria: CategoriaAnexo;
  nome_original: string;
  tamanho_bytes: number;
  content_type: string | null;
  descricao: string | null;
  created_at: string;
  enviado_por: UsuarioResumo | null;
  versao: number;
  tipo_documento: string | null;
  legenda: string | null;
}

export interface Medicao {
  id: string;
  encaminhamento_id: string | null;
  numero: number;
  periodo_inicio: string | null;
  periodo_fim: string | null;
  valor: string | null;
  percentual_executado: string | null;
  observacao: string | null;
  created_at: string;
  responsavel: UsuarioResumo | null;
  fotos: Anexo[];
}

export interface Encaminhamento {
  id: string;
  ordem: number;
  setor: string;
  assunto: string;
  instrucoes: string | null;
  status: StatusEncaminhamento;
  prazo: string | null;
  prazo_sugerido: boolean;
  assumido_em: string | null;
  devolvido_em: string | null;
  resultado: string | null;
  complemento_pedido: string | null;
  complemento_resposta: string | null;
  transferencias: number;
  rascunho: string | null;
  rascunho_em: string | null;
  checklist: { item: string; feito: boolean }[];
  created_at: string | null;
  responsavel: UsuarioResumo | null;
  criado_por: UsuarioResumo | null;
  participantes: UsuarioResumo[];
  anexos: Anexo[];
  medicoes: Medicao[];
}

export interface ProximaAcao {
  titulo: string;
  descricao: string;
  setor: string | null;
  responsavel: UsuarioResumo | null;
  prazo: string | null;
  dias_de_atraso: number;
  bloqueada: boolean;
  motivo_bloqueio: string | null;
}

export interface Andamento {
  id: string;
  encaminhamento_id: string | null;
  tipo: string;
  texto: string | null;
  autor_nome: string;
  autor_id: string | null;
  created_at: string;
  dados: {
    mudancas?: Record<string, [string | null, string | null]>;
    anexo_id?: string;
    nome?: string;
    removido?: string;
    mencionados?: { id: string; nome: string }[];
    aguardando_resposta?: boolean;
  } | null;
}

export interface PedidoLinha {
  id: string;
  numero: string;
  titulo: string;
  tipo: TipoPedido;
  situacao: Situacao;
  prioridade: string;
  origem: string;
  origem_nome: string | null;
  valor_previsto: string | null;
  setor_atual: string | null;
  responsavel_atual: UsuarioResumo | null;
  prazo_atual: string | null;
  complemento_pendente: boolean;
  tarefa_atual: string;
  dias_de_atraso: number;
  created_at: string;
  proxima_acao: string;
  saude: Saude;
  saude_motivo: string;
  emenda: string | null;
  situacao_desde: string | null;
  dias_na_situacao: number;
  motivo_parada: MotivoParada | null;
  motivo_parada_texto: string | null;
  motivo_parada_em: string | null;
  ultima_movimentacao_em: string | null;
}

export interface Pedido extends PedidoLinha {
  descricao: string | null;
  protocolo_externo: string | null;
  protocolo_sistema: string | null;
  protocolo_orgao: string | null;
  protocolo_data: string | null;
  valor_liberado: string | null;
  valor_pago: string | null;
  concluido_em: string | null;
  motivo_cancelamento: string | null;
  criado_por: UsuarioResumo | null;
  encaminhamento_atual: Encaminhamento | null;
  encaminhamentos: Encaminhamento[];
  andamentos: Andamento[];
  anexos: Anexo[];
  medicoes: Medicao[];
  proxima_acao_detalhe: ProximaAcao | null;
  saude_motivos: string[];
  partido: string | null;
  endereco: string | null;
  latitude: string | null;
  longitude: string | null;
  valor_empenhado: string | null;
  protocolo_situacao: string | null;
  indicadores: {
    horas_total: number;
    horas_com_assessor: number;
    horas_nos_setores: number;
    horas_aguardando_governo: number;
    idas_e_vindas: number;
    por_setor: Record<string, number>;
    pessoas: string[];
  } | null;
}

export interface Painel {
  contagens: {
    comigo: number;
    atrasados: number;
    aguardando_terceiro: number;
    em_setor: number;
    concluidos_no_ano: number;
    valor_em_andamento: string;
  };
  minha_caixa: PedidoLinha[];
  atrasados: PedidoLinha[];
  por_setor: {
    setor: string;
    nome: string;
    abertos: number;
    atrasados: number;
    valor: string;
  }[];
}

export interface GargaloSetor {
  setor: string;
  nome: string;
  abertos: number;
  parados: number;
  atrasados: number;
  dias_medios_agora: number;
  dias_medios_historico: number | null;
  passagens_concluidas: number;
}

export interface Fatia {
  chave: string;
  rotulo: string;
  quantidade: number;
  valor: string;
}

export interface ObraResumo {
  id: string;
  numero: string;
  titulo: string;
  situacao: Situacao;
  setor_atual: string | null;
  percentual_executado: string | null;
  ultima_medicao_em: string | null;
  valor_previsto: string | null;
  valor_pago: string | null;
  foto_id: string | null;
  dias_na_situacao: number;
  motivo_parada: MotivoParada | null;
}

export interface EventoRecente {
  pedido_id: string;
  numero: string;
  titulo: string;
  tipo: string;
  texto: string | null;
  autor_nome: string;
  created_at: string;
  setor?: string | null;
  tarefa?: string | null;
}

export interface PainelPrefeito {
  dias_alerta_parado: number;
  kpis: {
    em_andamento: number;
    parados: number;
    atrasados: number;
    aguardando_governo: number;
    concluidos_no_mes: number;
    concluidos_no_ano: number;
    valor_previsto: string;
    valor_liberado: string;
    valor_pago: string;
  };
  parados: PedidoLinha[];
  gargalos: GargaloSetor[];
  por_tipo: Fatia[];
  por_origem: Fatia[];
  por_parlamentar: Fatia[];
  por_motivo: Fatia[];
  obras: ObraResumo[];
  recentes: EventoRecente[];
}

export interface PainelAssessor {
  dias_alerta_parado: number;
  contagens: Record<
    | "caixa"
    | "complementos"
    | "em_setor"
    | "aguardando_governo"
    | "atrasados"
    | "parados"
    | "abertos",
    number
  >;
  caixa: PedidoLinha[];
  complementos: PedidoLinha[];
  atrasados: PedidoLinha[];
  parados: PedidoLinha[];
  aguardando_governo: PedidoLinha[];
  em_setor: PedidoLinha[];
  gargalos: GargaloSetor[];
  recentes: EventoRecente[];
}

export interface Ajustes {
  dias_alerta_parado: number;
  resumo_diario: boolean;
  resumo_hora: number;
  resumo_perfis: PerfilGovtask[];
}

export interface Eu {
  id: string;
  nome: string;
  email: string;
  papeis: string[];
  perfil?: PerfilGovtask;
  setor: string | null;
  permissoes: string[];
  pode_criar: boolean;
  pode_encaminhar: boolean;
  pode_trabalhar: boolean;
  pode_gerir_usuarios: boolean;
}

export interface MeuSetor {
  setor: Setor | null;
  contagens: {
    abertas: number;
    atrasadas: number;
    sem_responsavel: number;
    comigo: number;
  };
  tarefas: PedidoLinha[];
}

export interface Notificacao {
  id: string;
  pedido_id: string | null;
  encaminhamento_id: string | null;
  tipo: TipoNotificacao;
  texto: string;
  autor_nome: string;
  lida_em: string | null;
  created_at: string;
}

export interface Notificacoes {
  nao_lidas: number;
  itens: Notificacao[];
}

// ── Chamadas ─────────────────────────────────────────────────────────────

export const api = {
  eu: () => requisicao<Eu>("/eu"),
  usuarios: (q?: string, incluirInativos = false) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (incluirInativos) p.set("incluir_inativos", "true");
    return requisicao<UsuarioAdmin[]>(`/usuarios${p.toString() ? `?${p}` : ""}`);
  },
  editarUsuario: (
    id: string,
    dados: { perfil?: PerfilGovtask | null; setor?: string | null; ativo?: boolean }
  ) =>
    requisicao<UsuarioAdmin>(`/usuarios/${id}`, { method: "PATCH", body: JSON.stringify(dados) }),
  editarEmLote: (ids: string[], dados: { perfil?: PerfilGovtask | null; setor?: string | null }) =>
    requisicao<{ atualizados: number }>("/usuarios/lote", {
      method: "POST",
      body: JSON.stringify({ usuario_ids: ids, ...dados }),
    }),
  auditoria: (limite = 50) => requisicao<RegistroAuditoria[]>(`/auditoria?limite=${limite}`),
  painel: () => requisicao<Painel>("/painel"),
  painelPrefeito: () => requisicao<PainelPrefeito>("/painel/prefeito"),
  painelAssessor: () => requisicao<PainelAssessor>("/painel/assessor"),
  ajustes: () => requisicao<Ajustes>("/ajustes"),
  salvarAjustes: (dados: Partial<Ajustes>) =>
    requisicao<Ajustes>("/ajustes", { method: "PATCH", body: JSON.stringify(dados) }),
  definirParada: (id: string, motivo: MotivoParada | null, texto?: string) =>
    requisicao<Pedido>(`/pedidos/${id}/parada`, {
      method: "POST",
      body: JSON.stringify({ motivo, texto }),
    }),
  /** Foto como URL de objeto (o <img> não leva o Bearer). Revogue ao descartar. */
  urlDaFoto: async (pedidoId: string, anexoId: string) => {
    const token = obterToken();
    const resposta = await fetch(
      `${BASE_URL}/pedidos/${pedidoId}/anexos/${anexoId}/download`,
      { headers: token ? { Authorization: `Bearer ${token}` } : {} }
    );
    if (!resposta.ok) throw new Error("Foto indisponível.");
    return URL.createObjectURL(await resposta.blob());
  },
  meuSetor: (codigo?: string) =>
    requisicao<MeuSetor>(
      `/meu-setor${codigo ? `?codigo=${encodeURIComponent(codigo)}` : ""}`
    ),

  notificacoes: () => requisicao<Notificacoes>("/notificacoes"),
  marcarLidas: (id?: string) =>
    requisicao<Notificacoes>(
      `/notificacoes/marcar-lidas${id ? `?notificacao_id=${id}` : ""}`,
      { method: "POST" }
    ),

  setores: (incluirInativos = false) =>
    requisicao<Setor[]>(`/setores${incluirInativos ? "?incluir_inativos=true" : ""}`),
  criarSetor: (nome: string) =>
    requisicao<Setor>("/setores", { method: "POST", body: JSON.stringify({ nome }) }),
  editarSetor: (
    id: string,
    dados: { nome?: string; ativo?: boolean; prazo_dias?: number | null; responsavel_id?: string | null }
  ) =>
    requisicao<Setor>(`/setores/${id}`, {
      method: "PATCH",
      body: JSON.stringify(dados),
    }),
  removerSetor: (id: string) =>
    requisicao<void>(`/setores/${id}`, { method: "DELETE" }),

  definirSetor: (usuarioId: string, setor: string | null) =>
    requisicao<UsuarioAdmin>(`/usuarios/${usuarioId}`, {
      method: "PATCH",
      body: JSON.stringify({ setor }),
    }),
  lotarEmLote: (usuarioIds: string[], setor: string | null) =>
    requisicao<{ atualizados: number }>("/usuarios/lote", {
      method: "POST",
      body: JSON.stringify({ usuario_ids: usuarioIds, setor }),
    }),

  listar: (filtros: Record<string, string | number | boolean | undefined>) => {
    const query = new URLSearchParams();
    Object.entries(filtros).forEach(([chave, valor]) => {
      if (valor !== undefined && valor !== "" && valor !== false) {
        query.set(chave, String(valor));
      }
    });
    return requisicao<{
      itens: PedidoLinha[];
      total: number;
      pagina: number;
      tamanho: number;
    }>(`/pedidos?${query.toString()}`);
  },

  obter: (id: string) => requisicao<Pedido>(`/pedidos/${id}`),

  criar: (dados: Record<string, unknown>) =>
    requisicao<Pedido>("/pedidos", { method: "POST", body: JSON.stringify(dados) }),

  editar: (id: string, dados: Record<string, unknown>) =>
    requisicao<Pedido>(`/pedidos/${id}`, {
      method: "PATCH",
      body: JSON.stringify(dados),
    }),

  // ── Vai e vem ──
  encaminhar: (id: string, dados: Record<string, unknown>) =>
    requisicao<Pedido>(`/pedidos/${id}/encaminhar`, {
      method: "POST",
      body: JSON.stringify(dados),
    }),

  assumir: (id: string, encaminhamentoId: string) =>
    requisicao<Pedido>(
      `/pedidos/${id}/encaminhamentos/${encaminhamentoId}/assumir`,
      { method: "POST" }
    ),

  transferir: (id: string, encaminhamentoId: string, responsavelId: string, motivo?: string) =>
    requisicao<Pedido>(
      `/pedidos/${id}/encaminhamentos/${encaminhamentoId}/transferir`,
      {
        method: "POST",
        body: JSON.stringify({ responsavel_id: responsavelId, motivo }),
      }
    ),

  mencionar: (id: string, encaminhamentoId: string, usuariosIds: string[]) =>
    requisicao<Pedido>(
      `/pedidos/${id}/encaminhamentos/${encaminhamentoId}/mencionar`,
      { method: "POST", body: JSON.stringify({ usuarios_ids: usuariosIds }) }
    ),

  solicitarComplemento: (id: string, encaminhamentoId: string, texto: string) =>
    requisicao<Pedido>(
      `/pedidos/${id}/encaminhamentos/${encaminhamentoId}/complemento/solicitar`,
      { method: "POST", body: JSON.stringify({ texto }) }
    ),

  responderComplemento: (id: string, encaminhamentoId: string, texto: string) =>
    requisicao<Pedido>(
      `/pedidos/${id}/encaminhamentos/${encaminhamentoId}/complemento/responder`,
      { method: "POST", body: JSON.stringify({ texto }) }
    ),

  negociarPrazo: (id: string, encaminhamentoId: string, prazo: string, motivo?: string) =>
    requisicao<Pedido>(`/pedidos/${id}/encaminhamentos/${encaminhamentoId}/prazo`, {
      method: "POST",
      body: JSON.stringify({ prazo, motivo }),
    }),

  registrarMedicao: (id: string, encaminhamentoId: string, dados: Record<string, unknown>) =>
    requisicao<Pedido>(
      `/pedidos/${id}/encaminhamentos/${encaminhamentoId}/medicoes`,
      { method: "POST", body: JSON.stringify(dados) }
    ),

  devolver: (id: string, encaminhamentoId: string, resultado: string) =>
    requisicao<Pedido>(
      `/pedidos/${id}/encaminhamentos/${encaminhamentoId}/devolver`,
      { method: "POST", body: JSON.stringify({ resultado }) }
    ),

  aguardarTerceiro: (id: string, texto?: string) =>
    requisicao<Pedido>(`/pedidos/${id}/aguardar-terceiro`, {
      method: "POST",
      body: JSON.stringify({ texto }),
    }),

  retomar: (id: string, texto?: string) =>
    requisicao<Pedido>(`/pedidos/${id}/retomar`, {
      method: "POST",
      body: JSON.stringify({ texto }),
    }),

  concluir: (id: string, texto?: string) =>
    requisicao<Pedido>(`/pedidos/${id}/concluir`, {
      method: "POST",
      body: JSON.stringify({ texto }),
    }),

  comentar: (
    id: string,
    texto: string,
    opcoes: { encaminhamentoId?: string; mencionados?: string[]; aguardandoResposta?: boolean } = {}
  ) =>
    requisicao<Pedido>(`/pedidos/${id}/comentarios`, {
      method: "POST",
      body: JSON.stringify({
        texto,
        encaminhamento_id: opcoes.encaminhamentoId,
        mencionados_ids: opcoes.mencionados ?? [],
        aguardando_resposta: Boolean(opcoes.aguardandoResposta),
      }),
    }),

  salvarRascunho: (
    id: string,
    encaminhamentoId: string,
    dados: { texto?: string; checklist?: { item: string; feito: boolean }[] }
  ) =>
    requisicao<Pedido>(`/pedidos/${id}/encaminhamentos/${encaminhamentoId}/rascunho`, {
      method: "PUT",
      body: JSON.stringify(dados),
    }),

  classificarAnexo: (id: string, anexoId: string, dados: { tipo_documento?: string | null; legenda?: string | null }) =>
    requisicao<Pedido>(`/pedidos/${id}/anexos/${anexoId}`, {
      method: "PATCH",
      body: JSON.stringify(dados),
    }),

  /** Arquivo para ver no navegador (Office vira PDF no servidor). Revogue a URL. */
  urlVisualizar: async (id: string, anexoId: string) => {
    const token = obterToken();
    const resposta = await fetch(`${BASE_URL}/pedidos/${id}/anexos/${anexoId}/visualizar`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!resposta.ok) {
      const erro = await resposta.json().catch(() => ({ detail: "Não foi possível abrir." }));
      throw new Error(erro.detail);
    }
    const blob = await resposta.blob();
    return { url: URL.createObjectURL(blob), tipo: blob.type };
  },

  baixarTodos: async (id: string, numero: string) => {
    const token = obterToken();
    const resposta = await fetch(`${BASE_URL}/pedidos/${id}/documentos.zip`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!resposta.ok) throw new Error("Não foi possível gerar o .zip.");
    await _baixarBlob(await resposta.blob(), `documentos-${numero.replace("/", "-")}.zip`);
  },

  cancelar: (id: string, motivo: string) =>
    requisicao<Pedido>(`/pedidos/${id}/cancelar`, {
      method: "POST",
      body: JSON.stringify({ motivo }),
    }),

  anexar: (
    id: string,
    arquivo: File,
    opcoes: {
      encaminhamentoId?: string;
      medicaoId?: string;
      descricao?: string;
      categoria?: CategoriaAnexo;
      tipoDocumento?: string;
      legenda?: string;
    } = {},
    aoProgresso?: (fracao: number) => void
  ) => {
    const corpo = new FormData();
    corpo.append("arquivo", arquivo);
    if (opcoes.encaminhamentoId) corpo.append("encaminhamento_id", opcoes.encaminhamentoId);
    if (opcoes.medicaoId) corpo.append("medicao_id", opcoes.medicaoId);
    if (opcoes.descricao) corpo.append("descricao", opcoes.descricao);
    if (opcoes.categoria) corpo.append("categoria", opcoes.categoria);
    if (opcoes.tipoDocumento) corpo.append("tipo_documento", opcoes.tipoDocumento);
    if (opcoes.legenda) corpo.append("legenda", opcoes.legenda);
    if (!aoProgresso) {
      return requisicao<Pedido>(`/pedidos/${id}/anexos`, { method: "POST", body: corpo });
    }
    // XHR para ter progresso de envio (fetch não expõe upload progress).
    return new Promise<Pedido>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${BASE_URL}/pedidos/${id}/anexos`);
      const token = obterToken();
      if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.upload.onprogress = (e) => e.lengthComputable && aoProgresso(e.loaded / e.total);
      xhr.onload = () => {
        if (xhr.status === 401) {
          encerrarSessao();
          return reject(new ErroAutenticacao());
        }
        try {
          const corpoResp = JSON.parse(xhr.responseText || "{}");
          if (xhr.status >= 200 && xhr.status < 300) resolve(corpoResp);
          else reject(new Error(corpoResp.detail || `HTTP ${xhr.status}`));
        } catch {
          reject(new Error(`HTTP ${xhr.status}`));
        }
      };
      xhr.onerror = () => reject(new Error("Falha de rede no envio."));
      xhr.send(corpo);
    });
  },

  removerAnexo: (id: string, anexoId: string, motivo: string) =>
    requisicao<Pedido>(
      `/pedidos/${id}/anexos/${anexoId}?motivo=${encodeURIComponent(motivo)}`,
      { method: "DELETE" }
    ),

  /** Download autenticado: o <a href> não carrega o Bearer, então buscamos o blob. */
  baixarAnexo: async (id: string, anexo: Anexo) => {
    const token = obterToken();
    const resposta = await fetch(
      `${BASE_URL}/pedidos/${id}/anexos/${anexo.id}/download`,
      { headers: token ? { Authorization: `Bearer ${token}` } : {} }
    );
    if (!resposta.ok) throw new Error("Não foi possível baixar o arquivo.");
    await _baixarBlob(await resposta.blob(), anexo.nome_original);
  },

  /** Relatório do pedido em Excel. */
  baixarPedidoXlsx: async (id: string, numero: string) => {
    const token = obterToken();
    const resposta = await fetch(`${BASE_URL}/pedidos/${id}/relatorio.xlsx`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!resposta.ok) throw new Error("Não foi possível exportar o pedido.");
    await _baixarBlob(await resposta.blob(), `pedido-${numero.replace("/", "-")}.xlsx`);
  },

  /** Lista consolidada em Excel, com os filtros informados. */
  baixarListaXlsx: async (filtros: Record<string, string | number | boolean | undefined>) => {
    const query = new URLSearchParams();
    Object.entries(filtros).forEach(([chave, valor]) => {
      if (valor !== undefined && valor !== "" && valor !== false) {
        query.set(chave, String(valor));
      }
    });
    const token = obterToken();
    const resposta = await fetch(`${BASE_URL}/pedidos/exportar.xlsx?${query.toString()}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!resposta.ok) throw new Error("Não foi possível exportar a lista.");
    await _baixarBlob(await resposta.blob(), "pedidos.xlsx");
  },
};

async function _baixarBlob(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nome;
  link.click();
  URL.revokeObjectURL(url);
}
