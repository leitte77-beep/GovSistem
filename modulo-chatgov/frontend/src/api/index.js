export async function fetchConversas({ status, departamento, busca, arquivadas, signal } = {}) {
  const params = new URLSearchParams();
  if (status && status !== 'todas') params.set('status', status);
  if (departamento) params.set('departamento_id', departamento);
  if (busca) params.set('busca', busca);
  if (arquivadas) params.set('arquivadas', 'true');

  try {
    const res = await fetch(`/api/conversas?${params.toString()}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
      signal,
    });
    if (!res.ok) return [];
    return res.json();
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    return [];
  }
}

// Sinaliza que a conversa não existe mais (excluída ou fora do alcance do
// operador) — diferente de uma falha momentânea de rede, que não deve fechar o
// painel de quem está atendendo.
export class ConversaRemovidaError extends Error {
  constructor() {
    super('Conversa não encontrada');
    this.name = 'ConversaRemovidaError';
  }
}

// Estado atual de uma conversa (setor, responsável, status, protocolo). Retorna
// null quando a consulta falha; lança ConversaRemovidaError quando a conversa
// deixou de existir.
export async function fetchConversa(convId, { signal } = {}) {
  const res = await fetch(`/api/conversas/${convId}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
    signal,
  });
  if (res.status === 404) throw new ConversaRemovidaError();
  if (!res.ok) return null;
  return res.json();
}

// Retorna { mensagens, temMais }. `antesDe` (ISO criado_em) carrega o lote anterior
// para scroll infinito; sem cursor traz as últimas `limite` mensagens.
export async function fetchMensagens(convId, { antesDe, limite = 50, signal } = {}) {
  const params = new URLSearchParams();
  if (antesDe) params.set('antesDe', antesDe);
  if (limite) params.set('limite', String(limite));
  const res = await fetch(`/api/conversas/${convId}/mensagens?${params.toString()}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
    signal,
  });
  if (!res.ok) throw new Error('Erro ao buscar mensagens');
  const data = await res.json();
  // Compat: aceita resposta antiga (array) ou nova ({ mensagens, temMais }).
  if (Array.isArray(data)) return { mensagens: data, temMais: false };
  return { mensagens: data.mensagens || [], temMais: !!data.temMais };
}

export async function excluirMensagemConversa(convId, msgId) {
  const res = await fetch(`/api/conversas/${convId}/mensagens/${msgId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.erro || 'Erro ao excluir mensagem');
  }
  return res.json();
}

export async function fetchMidiasConversa(convId) {
  const res = await fetch(`/api/conversas/${convId}/midias`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error('Erro ao buscar mídias');
  return res.json();
}

export async function marcarConversaNaoLida(convId) {
  const res = await fetch(`/api/conversas/${convId}/marcar-nao-lida`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.erro || 'Erro ao marcar como não lida');
  }
  return res.json();
}

export async function fetchMe() {
  try {
    const res = await fetch('/api/me', {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function fetchDepartamentos({ signal } = {}) {
  try {
    const res = await fetch('/api/departamentos', {
      headers: { Authorization: `Bearer ${getToken()}` },
      signal,
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function fetchPainelDepartamentos() {
  const res = await fetch('/api/departamentos/painel', {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error('Erro ao buscar painel de departamentos');
  return res.json();
}

export async function fetchOperadores() {
  try {
    const res = await fetch('/api/operadores', {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function fetchWhatsAppStatus() {
  const res = await fetch('/api/whatsapp/status', {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) return { status: 'desconectado', numero: null };
  return res.json();
}

export async function fetchCanaisInternos() {
  const res = await fetch('/api/canais-internos', {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error('Erro ao buscar canais');
  return res.json();
}

export async function fetchMensagensInternas(canalId, { antesDe, limite = 50 } = {}) {
  const params = new URLSearchParams();
  if (antesDe) params.set('antesDe', antesDe);
  if (limite) params.set('limite', String(limite));
  const qs = params.toString();
  const res = await fetch(`/api/canais-internos/${canalId}/mensagens${qs ? '?' + qs : ''}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error('Erro ao buscar mensagens');
  return res.json();
}

export async function buscarMensagensCanal(canalId, q) {
  const res = await fetch(`/api/canais-internos/${canalId}/buscar?q=${encodeURIComponent(q)}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error('Erro ao buscar mensagens');
  return res.json();
}

export async function criarCanalInterno({ tipo, nome, membros }) {
  const res = await fetch('/api/canais-internos', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
    },
    body: JSON.stringify({ tipo, nome, membros }),
  });
  if (!res.ok) throw new Error('Erro ao criar canal');
  return res.json();
}

export async function excluirCanalInterno(id) {
  return jsonReq(`/api/canais-internos/${id}`, 'DELETE');
}

export async function adicionarMembrosCanal(id, membros) {
  return jsonReq(`/api/canais-internos/${id}/membros`, 'POST', { membros });
}

export async function removerMembroCanal(id, operadorId) {
  return jsonReq(`/api/canais-internos/${id}/membros/${operadorId}`, 'DELETE');
}

export async function sairCanal(id) {
  return jsonReq(`/api/canais-internos/${id}/sair`, 'POST');
}

export async function criarEnquete(canalId, pergunta, opcoes) {
  return jsonReq(`/api/canais-internos/${canalId}/enquetes`, 'POST', { pergunta, opcoes });
}

export async function votarEnquete(canalId, msgId, opcaoIdx) {
  return jsonReq(`/api/canais-internos/${canalId}/enquetes/${msgId}/votar`, 'POST', { opcao_idx: opcaoIdx });
}

export async function fetchSecretarias() {
  try {
    const res = await fetch('/api/secretarias', {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function criarSecretaria(body) {
  return jsonReq('/api/secretarias', 'POST', body);
}
export async function editarSecretaria(id, body) {
  return jsonReq(`/api/secretarias/${id}`, 'PUT', body);
}
export async function excluirSecretaria(id) {
  return jsonReq(`/api/secretarias/${id}`, 'DELETE');
}

export async function criarDepartamento(body) {
  return jsonReq('/api/departamentos', 'POST', body);
}
export async function editarDepartamento(id, body) {
  return jsonReq(`/api/departamentos/${id}`, 'PUT', body);
}
export async function excluirDepartamento(id) {
  return jsonReq(`/api/departamentos/${id}`, 'DELETE');
}

export async function editarOperador(id, body) {
  return jsonReq(`/api/operadores/${id}`, 'PUT', body);
}

export async function fetchConfig() {
  const res = await fetch('/api/config', { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error('Erro ao buscar configurações');
  return res.json();
}
export async function salvarConfig(body) {
  return jsonReq('/api/config', 'PUT', body);
}
export async function fetchBloqueios() {
  const res = await fetch('/api/bloqueios', { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error('Erro ao buscar bloqueios');
  return res.json();
}
export async function criarBloqueio(body) {
  return jsonReq('/api/bloqueios', 'POST', body);
}
export async function removerBloqueio(id) {
  return jsonReq(`/api/bloqueios/${id}`, 'DELETE');
}

export async function iniciarConversa(body) {
  return jsonReq('/api/conversas/iniciar', 'POST', body);
}

// Linha do tempo da conversa (quem assumiu, encaminhou, resolveu...).
export async function fetchHistoricoConversa(convId) {
  const res = await fetch(`/api/conversas/${convId}/historico`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error('Erro ao carregar o histórico');
  return res.json();
}

// Ficha completa do cidadão para o painel lateral: cadastro, protocolos,
// atendimentos anteriores e bloqueio, numa chamada só.
export async function fetchFichaCidadao(convId) {
  const res = await fetch(`/api/conversas/${convId}/ficha`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error('Erro ao carregar a ficha do cidadão');
  return res.json();
}

// Consulta se o telefone já tem contato cadastrado e atendimento em andamento,
// para preencher o nome e avisar sobre duplicidade antes de abrir a conversa.
export async function precheckContato(telefone, signal) {
  const res = await fetch(`/api/contatos/prechecagem?telefone=${encodeURIComponent(telefone)}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
    signal,
  });
  if (!res.ok) throw new Error('Erro ao consultar o contato');
  return res.json();
}

export async function fetchParticipantes(convId) {
  const res = await fetch(`/api/conversas/${convId}/participantes`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error('Erro ao buscar participantes');
  return res.json();
}

export async function fetchTransferenciaPendente(convId) {
  const res = await fetch(`/api/conversas/${convId}/transferencia`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error('Erro ao buscar transferência');
  return res.json();
}

async function jsonReq(url, method, body) {
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let msg = 'Erro na requisição';
    try { msg = (await res.json()).erro || msg; } catch {}
    throw new Error(msg);
  }
  try { return await res.json(); } catch { return {}; }
}

export async function seedDados() {
  const res = await fetch('/api/admin/seed', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
    },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error('Erro ao criar dados iniciais');
  return res.json();
}

// ===== Chatbot (imp.md) =====

export async function fetchChatbotConfig() {
  const res = await fetch('/api/chatbot/config', { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error('Erro ao buscar config chatbot');
  return res.json();
}

export async function salvarChatbotConfig(body) {
  return jsonReq('/api/chatbot/config', 'PUT', body);
}

export async function fetchPalavrasChave() {
  const res = await fetch('/api/chatbot/palavras-chave', { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error('Erro ao buscar palavras-chave');
  return res.json();
}

export async function criarPalavraChave(body) {
  return jsonReq('/api/chatbot/palavras-chave', 'POST', body);
}

export async function editarPalavraChave(id, body) {
  return jsonReq(`/api/chatbot/palavras-chave/${id}`, 'PUT', body);
}

export async function excluirPalavraChave(id) {
  return jsonReq(`/api/chatbot/palavras-chave/${id}`, 'DELETE');
}

export async function fetchFaqs(categoria) {
  const params = categoria ? `?categoria=${encodeURIComponent(categoria)}` : '';
  const res = await fetch(`/api/chatbot/faqs${params}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error('Erro ao buscar FAQs');
  return res.json();
}

export async function criarFaq(body) {
  return jsonReq('/api/chatbot/faqs', 'POST', body);
}

export async function editarFaq(id, body) {
  return jsonReq(`/api/chatbot/faqs/${id}`, 'PUT', body);
}

export async function excluirFaq(id) {
  return jsonReq(`/api/chatbot/faqs/${id}`, 'DELETE');
}

// ===== Iris — Assistente IA (DeepSeek) =====

export async function fetchIrisConfig() {
  const res = await fetch('/api/iris/config', { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error('Erro ao buscar config Iris');
  return res.json();
}

export async function salvarIrisConfig(body) {
  return jsonReq('/api/iris/config', 'PUT', body);
}

// ===== Templates / Respostas Rápidas =====

export async function fetchTemplates(categoria) {
  const params = categoria ? `?categoria=${encodeURIComponent(categoria)}` : '';
  const res = await fetch(`/api/templates${params}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error('Erro ao buscar templates');
  return res.json();
}

export async function criarTemplate(body) {
  return jsonReq('/api/templates', 'POST', body);
}

export async function editarTemplate(id, body) {
  return jsonReq(`/api/templates/${id}`, 'PUT', body);
}

export async function excluirTemplate(id) {
  return jsonReq(`/api/templates/${id}`, 'DELETE');
}

// ===== Protocolos =====

export async function fetchProtocolos(params = {}) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`/api/protocolos?${qs}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error('Erro ao buscar protocolos');
  return res.json();
}

export async function fetchProtocolo(numero) {
  const res = await fetch(`/api/protocolos/${numero}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error('Protocolo não encontrado');
  return res.json();
}

export async function atualizarStatusProtocolo(id, body) {
  return jsonReq(`/api/protocolos/${id}/status`, 'PATCH', body);
}

// ===== Notas Internas =====

export async function fetchNotasInternas(convId) {
  const res = await fetch(`/api/conversas/${convId}/notas`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error('Erro ao buscar notas');
  return res.json();
}

// ===== Etiquetas =====

export async function fetchEtiquetas() {
  const res = await fetch('/api/etiquetas', { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error('Erro ao buscar etiquetas');
  return res.json();
}

export async function criarEtiqueta(body) {
  return jsonReq('/api/etiquetas', 'POST', body);
}

export async function excluirEtiqueta(id) {
  return jsonReq(`/api/etiquetas/${id}`, 'DELETE');
}

export async function fetchEtiquetasConversa(convId) {
  const res = await fetch(`/api/conversas/${convId}/etiquetas`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error('Erro ao buscar etiquetas');
  return res.json();
}

// ===== Fila =====

export async function fetchPosicaoFila(convId) {
  const res = await fetch(`/api/fila/posicao/${convId}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) return { posicao: 0, estimativa_minutos: 0 };
  return res.json();
}

// ===== NPS =====

export async function fetchNPS(params = {}) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`/api/nps?${qs}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error('Erro ao buscar NPS');
  return res.json();
}

export async function fetchNPSPorSetor(params = {}) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`/api/nps/por-setor?${qs}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error('Erro ao buscar NPS');
  return res.json();
}

export async function fetchNPSPorAtendente(params = {}) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`/api/nps/por-atendente?${qs}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error('Erro ao buscar NPS');
  return res.json();
}

// ===== LGPD =====

export async function fetchConsentimentoLGPD(contatoId) {
  const res = await fetch(`/api/lgpd/consentimento/${contatoId}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) return { aceito: false };
  return res.json();
}

export async function registrarConsentimentoLGPD(body) {
  return jsonReq('/api/lgpd/consentimento', 'POST', body);
}

export async function solicitarExclusaoLGPD(body) {
  return jsonReq('/api/lgpd/exclusao', 'POST', body);
}

// ===== Painel Operacional =====

export async function fetchOperacional({ departamentoId, signal } = {}) {
  const params = new URLSearchParams();
  if (departamentoId) params.set('departamento_id', departamentoId);
  const qs = params.toString();
  const res = await fetch(`/api/conversas/operacional${qs ? '?' + qs : ''}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
    signal,
  });
  if (!res.ok) throw new Error('Erro ao carregar dados operacionais');
  return res.json();
}

// ===== Dashboard =====

export async function fetchDashboard({ inicio, fim, departamentoId, canal, signal } = {}) {
  const params = new URLSearchParams();
  if (inicio) params.set('inicio', inicio);
  if (fim) params.set('fim', fim);
  if (departamentoId) params.set('departamento_id', departamentoId);
  if (canal) params.set('canal', canal);
  const query = params.toString();
  const res = await fetch(`/api/admin/dashboard${query ? `?${query}` : ''}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
    signal,
  });
  if (!res.ok) throw new Error('Erro ao carregar o painel operacional');
  return res.json();
}

export async function fetchRelatorioMetricas(inicio, fim, { departamentoId, operadorId, status, canal, comparar, signal } = {}) {
  const params = new URLSearchParams();
  if (inicio) params.set('inicio', inicio);
  if (fim) params.set('fim', fim);
  if (departamentoId) params.set('departamento_id', departamentoId);
  if (operadorId) params.set('operador_id', operadorId);
  if (status) params.set('status', status);
  if (canal) params.set('canal', canal);
  if (comparar) params.set('comparar', 'true');
  const res = await fetch(`/api/relatorios/metricas?${params.toString()}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
    signal,
  });
  if (!res.ok) throw new Error(res.status === 403 ? 'Sem permissão para ver os indicadores' : 'Erro ao carregar indicadores');
  return res.json();
}

export async function fetchRelatorioNPSDetalhado(inicio, fim) {
  const params = new URLSearchParams();
  if (inicio) params.set('inicio', inicio);
  if (fim) params.set('fim', fim);
  const res = await fetch(`/api/relatorios/nps-detalhado?${params.toString()}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error('Erro ao carregar relatório NPS detalhado');
  return res.json();
}

export async function fetchRelatorioSLA(inicio, fim, departamentoId) {
  const params = new URLSearchParams();
  if (inicio) params.set('inicio', inicio);
  if (fim) params.set('fim', fim);
  if (departamentoId) params.set('departamento_id', departamentoId);
  const res = await fetch(`/api/relatorios/sla?${params.toString()}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error('Erro ao carregar relatório SLA');
  return res.json();
}

export async function fetchRelatorioAssuntos(inicio, fim) {
  const params = new URLSearchParams();
  if (inicio) params.set('inicio', inicio);
  if (fim) params.set('fim', fim);
  const res = await fetch(`/api/relatorios/conversas-por-assunto?${params.toString()}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error('Erro ao carregar relatório de assuntos');
  return res.json();
}

export async function registrarExportacaoRelatorio(formato, periodo, filtros) {
  return jsonReq('/api/relatorios/exportacoes', 'POST', { formato, periodo, filtros });
}

export async function fetchFiltrosRelatorio() {
  const res = await fetch('/api/relatorios/filtros', { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error('Erro ao carregar filtros do relatório');
  return res.json();
}

// ===== Busca =====

export async function buscaAvancada(q) {
  const res = await fetch(`/api/conversas/busca?q=${encodeURIComponent(q)}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error('Erro na busca');
  return res.json();
}

// ===== Contatos / Agenda =====

export async function fetchContatos(busca) {
  const params = busca ? `?busca=${encodeURIComponent(busca)}` : '';
  const res = await fetch(`/api/contatos${params}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error('Erro ao buscar contatos');
  return res.json();
}

export async function criarContato(body) {
  const res = await fetch('/api/contatos', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
    },
    body: JSON.stringify(body),
  });
  const dados = await res.json().catch(() => ({}));
  // Salvar novamente o mesmo cartão deve ser idempotente para o operador.
  if (res.status === 409 && dados.contato_existente) {
    return { ...dados.contato_existente, ja_cadastrado: true };
  }
  if (!res.ok) throw new Error(dados.erro || 'Erro ao adicionar contato à agenda');
  return dados;
}

export async function editarContato(id, body) {
  return jsonReq(`/api/contatos/${id}`, 'PUT', body);
}

export async function excluirContato(id) {
  return jsonReq(`/api/contatos/${id}`, 'DELETE');
}

function getToken() {
  try {
    const saved = localStorage.getItem('chatgov_auth');
    if (!saved) return '';
    return JSON.parse(saved).token;
  } catch {
    return '';
  }
}
