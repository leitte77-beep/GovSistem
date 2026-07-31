const baseUrl = process.env.CHATGOV_DEV_API_URL || 'http://127.0.0.1:13050';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(baseUrl)) {
  throw new Error('A verificação administrativa aceita somente localhost.');
}

const session = await fetch(`${baseUrl}/api/dev/saas/e2e-session`, { method: 'POST' }).then(async (response) => {
  if (!response.ok) throw new Error(`Sessão DEV indisponível: ${response.status}`);
  return response.json();
});
const headers = { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' };
const call = async (path, method = 'GET', body) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${path}: ${response.status} ${JSON.stringify(payload)}`);
  return payload;
};

const diagnostico = await call('/api/v2/admin/diagnosticos');
if (diagnostico.isolamento !== 'interno_dev') throw new Error('Ambiente não identificado como DEV.');
const massa = await call('/api/v2/admin/massa-sintetica', 'POST', {});

const stamp = Date.now();
const prompts = await Promise.all(Array.from({ length: 8 }, (_, indice) =>
  call('/api/v2/admin/iris/prompts', 'POST', {
    instrucoes_sistema: `Prompt sintético ${stamp}-${indice}: use somente fontes municipais autorizadas.`,
    fontes_autorizadas: ['base_municipal'],
    limite_confianca: 0.7,
  })));
if (new Set(prompts.map((prompt) => prompt.versao)).size !== prompts.length) {
  throw new Error('Concorrência gerou versões duplicadas de prompt.');
}

await call(`/api/v2/admin/iris/prompts/${prompts[0].id}/publicar`, 'POST', {});
const simulacao = await call('/api/v2/admin/iris/simular', 'POST', { mensagem: 'Como consultar o IPTU?' });
if (simulacao.enviou_ao_cidadao !== false) throw new Error('Simulador tentou enviar mensagem externa.');

const fluxo = await call('/api/v2/admin/chatbot/fluxos', 'POST', { nome: `Fluxo sintético ${stamp}` });
await Promise.all(Array.from({ length: 6 }, (_, indice) =>
  call(`/api/v2/admin/chatbot/fluxos/${fluxo.id}/versoes`, 'POST', {
    definicao: { inicio: { mensagem: `Versão sintética ${indice}` } },
  })));
const fluxos = await call('/api/v2/admin/chatbot/fluxos');
const fluxoCriado = fluxos.find((item) => item.id === fluxo.id);
if (new Set(fluxoCriado.versoes.map((versao) => versao.versao)).size !== fluxoCriado.versoes.length) {
  throw new Error('Concorrência gerou versões duplicadas de fluxo.');
}

const invalidResponse = await fetch(`${baseUrl}/api/v2/admin/iris/prompts/invalido/publicar`, {
  method: 'POST', headers, body: '{}',
});
if (invalidResponse.status !== 400) throw new Error(`UUID inválido deveria retornar 400; retornou ${invalidResponse.status}.`);

console.log(JSON.stringify({
  ambiente: diagnostico.isolamento,
  massa_sintetica: massa,
  prompts_concorrentes: prompts.length,
  fluxos_concorrentes: 6,
  simulacao_sem_envio: true,
  validacao_uuid: 400,
}, null, 2));
