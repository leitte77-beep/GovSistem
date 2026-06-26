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

// Projetos e Tarefas
export async function fetchProjetos() {
  const res = await fetch('/api/evolucoes/projetos', { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error('Erro ao buscar projetos');
  return res.json();
}

export async function criarProjetoApi(body) {
  return jsonReq('/api/evolucoes/projetos', 'POST', body);
}

export async function fetchKanban(projetoId) {
  const res = await fetch(`/api/evolucoes/projetos/${projetoId}/kanban`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error('Erro ao carregar kanban');
  return res.json();
}

export async function criarColunaApi(projetoId, body) {
  return jsonReq(`/api/evolucoes/projetos/${projetoId}/colunas`, 'POST', body);
}

export async function criarTarefaApi(body) {
  return jsonReq('/api/evolucoes/tarefas', 'POST', body);
}

export async function fetchTarefa(id) {
  const res = await fetch(`/api/evolucoes/tarefas/${id}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error('Erro ao buscar tarefa');
  return res.json();
}

export async function atualizarTarefaApi(id, body) {
  return jsonReq(`/api/evolucoes/tarefas/${id}`, 'PATCH', body);
}

export async function moverTarefaApi(id, body) {
  return jsonReq(`/api/evolucoes/tarefas/${id}/mover`, 'POST', body);
}

export async function fetchMinhasTarefas() {
  const res = await fetch('/api/evolucoes/tarefas/minhas', { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error('Erro ao buscar tarefas');
  return res.json();
}

// Arquivos
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

export async function fetchPastas(setor_id) {
  const params = setor_id ? `?setor_id=${encodeURIComponent(setor_id)}` : '';
  const res = await fetch(`/api/evolucoes/pastas${params}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error('Erro ao buscar pastas');
  return res.json();
}

export async function fetchArquivosPasta(pastaId) {
  const res = await fetch(`/api/evolucoes/pastas/${pastaId}/arquivos`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error('Erro ao buscar arquivos');
  return res.json();
}

export async function fetchArquivosBusca(q) {
  const res = await fetch(`/api/evolucoes/arquivos/buscar?q=${encodeURIComponent(q)}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error('Erro na busca');
  return res.json();
}

// Reuniões
export async function criarReuniaoApi(body) {
  return jsonReq('/api/evolucoes/reunioes', 'POST', body);
}

export async function fetchReunioes(params = {}) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`/api/evolucoes/reunioes?${qs}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error('Erro ao buscar reuniões');
  return res.json();
}

export async function fetchCalendario(inicio, fim) {
  const params = new URLSearchParams();
  if (inicio) params.set('inicio', inicio);
  if (fim) params.set('fim', fim);
  const res = await fetch(`/api/evolucoes/calendario?${params}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error('Erro ao buscar calendário');
  return res.json();
}

// Notificações
export async function fetchNotificacoes(apenasNaoLidas) {
  const params = apenasNaoLidas ? '?apenas_nao_lidas=true' : '';
  const res = await fetch(`/api/evolucoes/notificacoes${params}`, { headers: { Authorization: `Bearer ${getToken()}` } });
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

export async function fetchConfigNotificacoes() {
  const res = await fetch('/api/evolucoes/config/notificacoes', { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) return { push_ativo: true, som_ativado: true };
  return res.json();
}

export async function salvarConfigNotificacoes(body) {
  return jsonReq('/api/evolucoes/config/notificacoes', 'PUT', body);
}

// Wiki
export async function fetchArtigos(categoria) {
  const params = categoria ? `?categoria=${encodeURIComponent(categoria)}` : '';
  const res = await fetch(`/api/evolucoes/wiki${params}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error('Erro ao buscar artigos');
  return res.json();
}

export async function fetchCategoriasWiki() {
  const res = await fetch('/api/evolucoes/wiki/categorias', { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error('Erro ao buscar categorias');
  return res.json();
}

export async function criarArtigoApi(body) {
  return jsonReq('/api/evolucoes/wiki', 'POST', body);
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
