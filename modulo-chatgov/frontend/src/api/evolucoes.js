// ===== API para evolucoes =====

function getToken() {
  try {
    const saved = localStorage.getItem('chatgov_auth');
    if (!saved) return '';
    return JSON.parse(saved).token;
  } catch {
    return '';
  }
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

// Presença
export async function fetchPresenca() {
  const res = await fetch('/api/evolucoes/presenca', { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error('Erro ao buscar presença');
  return res.json();
}

export async function atualizarPresencaApi(status, mensagem) {
  return jsonReq('/api/evolucoes/presenca', 'PUT', { status, mensagem });
}

// Arquivos (upload compartilhado pelo chat interno e mídias)
export async function uploadArquivoApi(file, conversa_id, pasta_id, canal_id, tarefa_id) {
  const form = new FormData();
  form.append('arquivo', file);
  if (conversa_id) form.append('conversa_id', conversa_id);
  if (pasta_id) form.append('pasta_id', pasta_id);
  if (canal_id) form.append('canal_id', canal_id);
  if (tarefa_id) form.append('tarefa_id', tarefa_id);
  const res = await fetch('/api/evolucoes/arquivos/upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${getToken()}` },
    body: form,
  });
  if (!res.ok) throw new Error('Erro ao fazer upload');
  return res.json();
}

// Calendário (Agenda)
export async function fetchCalendario(inicio, fim) {
  const params = new URLSearchParams();
  if (inicio) params.set('inicio', inicio);
  if (fim) params.set('fim', fim);
  const res = await fetch(`/api/evolucoes/calendario?${params}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error('Erro ao buscar calendário');
  return res.json();
}

// Notificações
export async function fetchNotificacoes(filtros = {}) {
  if (typeof filtros === 'boolean') filtros = { apenasNaoLidas: filtros };
  const params = new URLSearchParams();
  if (filtros.apenasNaoLidas) params.set('apenas_nao_lidas', 'true');
  if (filtros.arquivadas) params.set('arquivadas', 'true');
  if (filtros.busca) params.set('busca', filtros.busca);
  if (filtros.tipo) params.set('tipo', filtros.tipo);
  if (filtros.pagina) params.set('pagina', filtros.pagina);
  if (filtros.limite) params.set('limite', filtros.limite);
  const res = await fetch(`/api/evolucoes/notificacoes?${params}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error('Erro ao buscar notificações');
  return res.json();
}

export async function fetchContagemNotificacoes() {
  const res = await fetch('/api/evolucoes/notificacoes/contagem', { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) return { total: 0 };
  return res.json();
}

export async function fetchNotificacoesStatus() {
  const res = await fetch('/api/evolucoes/notificacoes/status', { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) return { notificacoes: 0, conversas: 0, total: 0, config: { push_ativo: true, som_ativado: true } };
  return res.json();
}

export async function marcarNotificacaoLidaApi(id) {
  return jsonReq(`/api/evolucoes/notificacoes/${id}/ler`, 'POST');
}

export async function marcarTodasNotificacoesLidas() {
  return jsonReq('/api/evolucoes/notificacoes/ler-todas', 'POST');
}

export async function arquivarNotificacaoApi(id) {
  return jsonReq(`/api/evolucoes/notificacoes/${id}/arquivar`, 'POST');
}

export async function fetchConfigNotificacoes() {
  const res = await fetch('/api/evolucoes/config/notificacoes', { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) return { push_ativo: true, som_ativado: true };
  return res.json();
}

export async function salvarConfigNotificacoes(body) {
  return jsonReq('/api/evolucoes/config/notificacoes', 'PUT', body);
}

// Avisos internos
export async function fetchAvisosPendentes() {
  const res = await fetch('/api/evolucoes/avisos/pendentes', { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error('Erro ao carregar avisos');
  return res.json();
}

export async function fetchAvisosAdmin() {
  const res = await fetch('/api/evolucoes/avisos/admin', { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error('Erro ao carregar avisos');
  return res.json();
}

export async function fetchDestinatariosAviso(id) {
  const res = await fetch(`/api/evolucoes/avisos/${id}/destinatarios`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error('Erro ao carregar destinatários');
  return res.json();
}

export async function criarAvisoApi(body) {
  return jsonReq('/api/evolucoes/avisos', 'POST', body);
}

export async function editarAvisoApi(id, body) {
  return jsonReq(`/api/evolucoes/avisos/${id}`, 'PUT', body);
}

export async function desativarAvisoApi(id) {
  return jsonReq(`/api/evolucoes/avisos/${id}`, 'DELETE');
}

export async function republicarAvisoApi(id) {
  return jsonReq(`/api/evolucoes/avisos/${id}/republicar`, 'POST');
}

export async function marcarAvisoLidoApi(id, confirmado) {
  return jsonReq(`/api/evolucoes/avisos/${id}/ler`, 'POST', { confirmado: Boolean(confirmado) });
}

// Mensagens fixadas
export async function fetchMensagensFixadas(canalId) {
  const res = await fetch(`/api/evolucoes/canais-internos/${canalId}/fixadas`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error('Erro ao buscar fixadas');
  return res.json();
}

export async function fetchReacoes(canalId, msgId) {
  const res = await fetch(`/api/evolucoes/canais-internos/${canalId}/mensagens/${msgId}/reacoes`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) return [];
  return res.json();
}
