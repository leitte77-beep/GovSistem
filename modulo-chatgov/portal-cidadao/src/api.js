const API = '/api/v1/public';

export function getToken() {
  try { return localStorage.getItem('portal_token') || ''; } catch { return ''; }
}

export function setToken(t) { localStorage.setItem('portal_token', t || ''); }
export function getConta() {
  try { return JSON.parse(localStorage.getItem('portal_conta') || 'null'); } catch { return null; }
}
export function setConta(c) { localStorage.setItem('portal_conta', JSON.stringify(c || null)); }

async function req(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && getToken()) headers.Authorization = `Bearer ${getToken()}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.erro || 'Erro na requisição');
  return data;
}

export const api = {
  // Consulta sem cadastro
  acessar: (numero, senha) => req('/protocols/access', { method: 'POST', body: { numero, senha }, auth: false }),
  recuperarAcesso: (numero) => req('/protocols/recover-access', { method: 'POST', body: { numero }, auth: false }),
  validarSessao: () => req('/protocols/session'),

  // Protocolo (com sessão pública)
  detalhesProtocolo: (id) => req(`/protocols/${id}`),
  mensagensProtocolo: (id) => req(`/protocols/${id}/messages`),
  enviarMensagem: (id, conteudo) => req(`/protocols/${id}/messages`, { method: 'POST', body: { conteudo } }),
  documentosProtocolo: (id) => req(`/protocols/${id}/documents`),
  downloadDocumento: (id, docId) => req(`/protocols/${id}/documents/${docId}/download`),

  // Catálogo e solicitação
  servicos: () => req('/services', { auth: false }),
  detalhesServico: (id) => req(`/services/${id}`, { auth: false }),
  criarSolicitacao: (body) => req('/protocols', { method: 'POST', body, auth: false }),

  // Autenticação do cidadão
  login: (email, senha) => req('/auth/login', { method: 'POST', body: { email, senha }, auth: false }),
  meusProtocolos: () => req('/my/protocols'),
};
