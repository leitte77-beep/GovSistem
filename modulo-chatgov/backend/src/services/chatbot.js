import db from '../db.js';

const PALAVRAS_TRANSFERENCIA = [
  'falar com atendente', 'atendente', 'humano', 'pessoa',
  'atendimento', 'falar com alguém', 'falar com alguem',
  'quero falar', 'preciso falar', 'urgente', 'transferir',
  'não resolveu', 'nao resolveu', 'não ajudou', 'nao ajudou',
];

function detectaTransferencia(texto) {
  const t = texto.toLowerCase();
  return PALAVRAS_TRANSFERENCIA.some((kw) => t.includes(kw));
}

function similaridadeLevenshtein(a, b) {
  const la = a.toLowerCase().replace(/[^a-z0-9\s]/g, '');
  const lb = b.toLowerCase().replace(/[^a-z0-9\s]/g, '');

  if (la.length === 0 && lb.length === 0) return 1;
  if (la.length === 0 || lb.length === 0) return 0;

  const matrix = [];
  for (let i = 0; i <= la.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= lb.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= la.length; i++) {
    for (let j = 1; j <= lb.length; j++) {
      const cost = la[i - 1] === lb[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  const maxLen = Math.max(la.length, lb.length);
  return 1 - matrix[la.length][lb.length] / maxLen;
}

export async function buscarKeywords(tenantId, texto) {
  const regras = await db.manyOrNone(
    'SELECT * FROM palavras_chave WHERE tenant_id = $1 AND ativo = true ORDER BY prioridade DESC',
    [tenantId]
  );

  for (const regra of regras) {
    for (const palavra of regra.palavras) {
      if (texto.toLowerCase().includes(palavra.toLowerCase())) {
        return { resposta: regra.resposta, departamento_id: regra.departamento_id || null };
      }
    }
  }
  return null;
}

export async function buscarFAQ(tenantId, texto, threshold = 0.6) {
  const faqs = await db.manyOrNone(
    'SELECT * FROM faqs WHERE tenant_id = $1 AND ativo = true',
    [tenantId]
  );

  if (!faqs || faqs.length === 0) return null;

  let melhor = null;
  let melhorScore = 0;

  for (const faq of faqs) {
    const score = similaridadeLevenshtein(texto, faq.pergunta);
    if (score > melhorScore) {
      melhorScore = score;
      melhor = faq;
    }
  }

  if (melhor && melhorScore >= threshold) {
    return { resposta: melhor.resposta, score: melhorScore };
  }
  return null;
}

export async function buscarLLM(tenantId, mensagem, historico = []) {
  const config = await db.oneOrNone(
    'SELECT * FROM config_chatbot WHERE tenant_id = $1 AND ativo = true AND usar_llm = true',
    [tenantId]
  );
  if (!config || !config.llm_api_key) return null;

  const provider = config.llm_provider || 'openai';
  const model = config.llm_model || 'gpt-4o-mini';

  try {
    const messages = [];

    if (config.llm_system_prompt) {
      messages.push({ role: 'system', content: config.llm_system_prompt });
    } else {
      messages.push({
        role: 'system',
        content:
          'Você é um assistente virtual de uma prefeitura/órgão público brasileiro. Responda de forma clara, educada e objetiva. Sempre responda em português do Brasil. Se não souber a resposta, diga que irá transferir para um atendente humano.',
      });
    }

    for (const h of historico.slice(-10)) {
      messages.push({ role: h.direcao === 'entrada' ? 'user' : 'assistant', content: h.conteudo });
    }

    messages.push({ role: 'user', content: mensagem });

    let resposta;

    if (provider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.llm_api_key}`,
        },
        body: JSON.stringify({ model, messages, max_tokens: 500, temperature: 0.7 }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      resposta = data.choices?.[0]?.message?.content;
    } else if (provider === 'anthropic') {
      const systemMsg = messages.find((m) => m.role === 'system');
      const userMsgs = messages.filter((m) => m.role !== 'system');
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.llm_api_key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 500,
          system: systemMsg?.content || '',
          messages: userMsgs,
        }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      resposta = data.content?.[0]?.text;
    }

    return resposta || null;
  } catch (err) {
    console.error('[Chatbot] Erro LLM:', err.message);
    return null;
  }
}

export async function processarMensagem(tenantId, conversaId, contatoId, texto) {
  if (!texto || !texto.trim()) return null;

  texto = texto.trim();

  if (detectaTransferencia(texto)) {
    return { respondido: false, motivo: 'transferencia_solicitada' };
  }

  const config = await db.oneOrNone(
    'SELECT * FROM config_chatbot WHERE tenant_id = $1 AND ativo = true',
    [tenantId]
  );

  if (!config) return null;

  const historico = await db.manyOrNone(
    `SELECT direcao, conteudo FROM mensagens
     WHERE conversa_id = $1 AND tenant_id = $2 AND tipo = 'texto'
     ORDER BY criado_em ASC LIMIT 20`,
    [conversaId, tenantId]
  );

  if (config.usar_keywords) {
    const kwResult = await buscarKeywords(tenantId, texto);
    if (kwResult) {
      return { respondido: true, resposta: kwResult.resposta, origem: 'keyword', departamento_id: kwResult.departamento_id };
    }
  }

  if (config.usar_faq) {
    const threshold = config.threshold_faq || 0.6;
    const faqResult = await buscarFAQ(tenantId, texto, threshold);
    if (faqResult) {
      return { respondido: true, resposta: faqResult.resposta, origem: 'faq', score: faqResult.score };
    }
  }

  if (config.usar_llm) {
    const resp = await buscarLLM(tenantId, texto, historico);
    if (resp) {
      return { respondido: true, resposta: resp, origem: 'llm' };
    }
  }

  return null;
}

export async function getConfigChatbot(tenantId) {
  const config = await db.oneOrNone('SELECT * FROM config_chatbot WHERE tenant_id = $1', [tenantId]);
  if (!config) {
    return { ativo: false };
  }
  return config;
}
