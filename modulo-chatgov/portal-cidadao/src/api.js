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
  timelineProtocolo: (id) => req(`/protocols/${id}/timeline`),

  // Download devolve o arquivo, não JSON: precisa ser tratado como blob e
  // salvo pelo navegador. Passar por req() fazia res.json() estourar.
  baixarDocumento: async (id, docId, nomeArquivo) => {
    const res = await fetch(`${API}/protocols/${id}/documents/${docId}/download`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.erro || 'Não foi possível baixar o documento');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nomeArquivo || 'documento';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  // Envio de documento pelo cidadão (multipart, sem Content-Type manual:
  // o navegador precisa definir o boundary).
  enviarDocumento: async (id, file, onProgresso) => {
    const formData = new FormData();
    formData.append('arquivo', file);
    const res = await fetch(`${API}/protocols/${id}/documents/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}` },
      body: formData,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.erro || 'Não foi possível enviar o documento');
    if (onProgresso) onProgresso(data);
    return data;
  },

  // Catálogo e solicitação
  servicos: (tenantSlug) => {
    const qs = tenantSlug ? `?tenant=${encodeURIComponent(tenantSlug)}` : '';
    return req(`/services${qs}`, { auth: false });
  },
  detalhesServico: (id) => req(`/services/${id}`, { auth: false }),
  criarSolicitacao: (body) => req('/protocols', { method: 'POST', body, auth: false }),
  tenants: () => req('/tenants', { auth: false }),

  // Autenticação do cidadão
  registrar: (dados) => req('/auth/register', { method: 'POST', body: dados, auth: false }),
  login: (email, senha) => req('/auth/login', { method: 'POST', body: { email, senha }, auth: false }),
  forgotPassword: (email) => req('/auth/forgot-password', { method: 'POST', body: { email }, auth: false }),
  resetPassword: (email, token, novaSenha) => req('/auth/reset-password', { method: 'POST', body: { email, token, nova_senha: novaSenha }, auth: false }),
  meusProtocolos: () => req('/my/protocols'),
  minhaConta: () => req('/my/account'),
  criarSolicitacaoLogado: (body) => req('/my/protocols', { method: 'POST', body }),
};
