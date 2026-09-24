function token() {
  try {
    return JSON.parse(localStorage.getItem('chatgov_auth') || '{}').token || '';
  } catch {
    return '';
  }
}

async function request(path, method = 'GET', body) {
  const response = await fetch(`/api/v2/admin${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token()}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.erro || `Falha HTTP ${response.status}`);
  return payload;
}

export const adminApi = {
  canais: () => request('/canais'),
  criarCanal: (body) => request('/canais', 'POST', body),
  atualizarCanal: (id, body) => request(`/canais/${id}`, 'PUT', body),
  diagnosticarCanal: (id) => request(`/canais/${id}/diagnostico`, 'POST', {}),
  desconectarCanal: (id, motivo) => request(`/canais/${id}/desconectar`, 'POST', { motivo }),
  horarios: () => request('/horarios'),
  criarHorario: (body) => request('/horarios', 'POST', body),
  atualizarHorario: (id, body) => request(`/horarios/${id}`, 'PUT', body),
  sla: () => request('/sla'),
  salvarSla: (departamentoId, body) => request(`/sla/departamentos/${departamentoId}`, 'PUT', body),
  roteamento: () => request('/roteamento'),
  salvarRoteamento: (departamentoId, body) => request(`/roteamento/departamentos/${departamentoId}`, 'PUT', body),
  retencao: () => request('/retencao'),
  salvarRetencao: (body) => request('/retencao', 'PUT', body),
  promptsIris: () => request('/iris/prompts'),
  criarPromptIris: (body) => request('/iris/prompts', 'POST', body),
  publicarPromptIris: (id) => request(`/iris/prompts/${id}/publicar`, 'POST', {}),
  simularIris: (mensagem) => request('/iris/simular', 'POST', { mensagem }),
  fluxosChatbot: () => request('/chatbot/fluxos'),
  criarFluxoChatbot: (body) => request('/chatbot/fluxos', 'POST', body),
  criarVersaoFluxo: (id, definicao) => request(`/chatbot/fluxos/${id}/versoes`, 'POST', { definicao }),
  publicarFluxo: (id, versao) => request(`/chatbot/fluxos/${id}/publicar/${versao}`, 'POST', {}),
  diagnosticos: () => request('/diagnosticos'),
  auditoria: () => request('/auditoria?limite=100'),
  falhas: () => request('/mensagens/falhas'),
  criarMassaSintetica: () => request('/massa-sintetica', 'POST', {}),
};
