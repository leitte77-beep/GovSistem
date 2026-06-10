import db from '../db.js';

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';

function buildSystemPrompt(tenantNome, secretarias, departamentos) {
  const deptos = departamentos.map((d) => {
    const sec = secretarias.find((s) => s.id === d.secretaria_id);
    const prefix = sec ? `${sec.nome} › ` : '';
    return `  - "${d.nome}" (id: ${d.id})${prefix ? ` — ${prefix.slice(0, -3)}` : ''}`;
  }).join('\n');

  const deptosCompact = departamentos.map((d) => {
    const sec = secretarias.find((s) => s.id === d.secretaria_id);
    return { id: d.id, nome: d.nome, secretaria: sec?.nome || 'Geral' };
  });

  return `Voce e a Iris, assistente virtual da Prefeitura ${tenantNome || 'Municipal'}.
Seu objetivo e atender cidadaos com educacao, clareza e empatia, 24 horas por dia.

REGRAS:
1. Sempre se apresente no primeiro contato: "Ola! Sou a Iris, assistente virtual da Prefeitura. Em que posso ajudar?"
2. Encaminhe DIRETAMENTE ao departamento correto. NAO encaminhe para Recepcao se o departamento alvo existe.
3. Se o departamento alvo NAO estiver na lista, ai sim encaminhe para Recepcao.
4. Se o cidadao pedir atendente humano sem especificar setor, encaminhe para Recepcao.
5. Se nao tiver certeza, faca ate 2 perguntas. Se ainda nao souber, encaminhe para Recepcao.
6. NUNCA invente informacoes. Nao de diagnosticos medicos.
7. Seja educada, empatica e direta ao ponto.

DEPARTAMENTOS DISPONIVEIS:
${deptos}

FORMATO DE RESPOSTA (JSON obrigatorio):
{
  "resposta": "sua mensagem para o cidadao",
  "departamento_id": "id-do-departamento ou null",
  "finalizado": true
}

IMPORTANTE: 
- "departamento_id": use o UUID do departamento que esta na lista acima. NAO use null se souber o departamento.
- So use "departamento_id": null se ainda estiver fazendo perguntas.
- "finalizado": true ao encaminhar. false so se fizer pergunta e esperar resposta.

DEPARTAMENTOS EM JSON:
${JSON.stringify(deptosCompact)}`;
}

export async function processarComIris(tenantId, conversaId, texto) {
  const cfg = await db.oneOrNone(
    'SELECT * FROM config_iris WHERE tenant_id = $1 AND ativo = true',
    [tenantId]
  );
  if (!cfg || !cfg.api_key) return null;

  const tenant = await db.oneOrNone(
    'SELECT nome FROM tenants WHERE id = $1',
    [tenantId]
  );

  const secretarias = await db.manyOrNone(
    'SELECT id, nome FROM secretarias WHERE tenant_id = $1 ORDER BY nome',
    [tenantId]
  );

  const departamentos = await db.manyOrNone(
    'SELECT id, nome, secretaria_id FROM departamentos WHERE tenant_id = $1 AND ativo = true ORDER BY nome',
    [tenantId]
  );

  const historico = await db.manyOrNone(
    `SELECT direcao, CASE WHEN direcao = 'entrada' THEN conteudo ELSE conteudo END as conteudo
     FROM mensagens
     WHERE conversa_id = $1 AND tenant_id = $2 AND tipo = 'texto'
     ORDER BY criado_em DESC LIMIT 15`,
    [conversaId, tenantId]
  );

  let systemPrompt = cfg.system_prompt || buildSystemPrompt(tenant?.nome, secretarias, departamentos);

  if (cfg.system_prompt) {
    const deptosCompact = departamentos.map((d) => {
      const sec = secretarias.find((s) => s.id === d.secretaria_id);
      return { id: d.id, nome: d.nome, secretaria: sec?.nome || 'Geral' };
    });
    systemPrompt += `\n\nDEPARTAMENTOS DISPONIVEIS (use o UUID exato em "departamento_id"):\n${JSON.stringify(deptosCompact)}`;
  }

  const messages = [
    { role: 'system', content: systemPrompt },
  ];

  for (let i = historico.length - 1; i >= 0; i--) {
    const h = historico[i];
    const clean = h.conteudo.replace(/^🤖\s*/, '');
    if (h.direcao === 'entrada') {
      messages.push({ role: 'user', content: clean });
    } else {
      messages.push({ role: 'assistant', content: clean });
    }
  }

  try {
    const body = JSON.stringify({
      model: cfg.model || 'deepseek-chat',
      messages,
      temperature: cfg.temperatura ?? 0.7,
      max_tokens: cfg.max_tokens ?? 1024,
      response_format: { type: 'json_object' },
    });

    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Authorization': `Bearer ${cfg.api_key}`,
      },
      body,
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[Iris] DeepSeek API error:', response.status, errText.slice(0, 300));
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      // DeepSeek retornou texto puro em vez de JSON — usa fallback
      const raw = (content || '').trim();
      console.log('[Iris] Resposta nao-JSON, usando fallback:', raw.slice(0, 100));
      const recepcao = await db.oneOrNone(
        "SELECT id FROM departamentos WHERE tenant_id = $1 AND LOWER(nome) = 'recepcao' AND ativo = true",
        [tenantId]
      );
      return {
        respondido: true,
        resposta: raw
          ? raw.slice(0, 1000)
          : 'Desculpe, nao entendi sua mensagem. Poderia reformular, por favor?',
        departamento_id: recepcao?.id || null,
        finalizado: true,
        origem: 'iris',
      };
    }

    console.log('[Iris] Resposta:', JSON.stringify({ resposta: parsed.resposta?.slice(0, 80), departamento_id: parsed.departamento_id, finalizado: parsed.finalizado }));

    // Valida se o departamento_id existe no tenant
    let deptoValido = null;
    if (parsed.departamento_id) {
      try {
        const depto = await db.oneOrNone(
          'SELECT id FROM departamentos WHERE id = $1 AND tenant_id = $2 AND ativo = true',
          [parsed.departamento_id, tenantId]
        );
        if (depto) {
          deptoValido = parsed.departamento_id;
        } else {
          console.log('[Iris] Departamento invalido, ignorando:', parsed.departamento_id);
        }
      } catch {
        console.log('[Iris] Departamento nao-UUID, buscando por nome:', parsed.departamento_id);
        const deptoByName = await db.oneOrNone(
          `SELECT id FROM departamentos WHERE tenant_id = $1 AND ativo = true AND LOWER(nome) = LOWER($2)`,
          [tenantId, String(parsed.departamento_id)]
        );
        if (deptoByName) {
          deptoValido = deptoByName.id;
        } else {
          console.log('[Iris] Departamento nao encontrado por nome:', parsed.departamento_id);
        }
      }
    }

    return {
      respondido: true,
      resposta: parsed.resposta || 'Desculpe, nao entendi. Um atendente ira ajuda-lo.',
      departamento_id: deptoValido,
      finalizado: parsed.finalizado !== false,
      origem: 'iris',
    };
  } catch (err) {
    console.error('[Iris] Erro ao processar:', err.message);
    return null;
  }
}

export async function getConfigIris(tenantId) {
  const cfg = await db.oneOrNone('SELECT * FROM config_iris WHERE tenant_id = $1', [tenantId]);
  if (!cfg) {
    return { ativo: false, model: 'deepseek-chat', temperatura: 0.7, max_tokens: 1024 };
  }
  return cfg;
}

export async function saveConfigIris(tenantId, body) {
  const fields = [];
  const values = [tenantId];
  let idx = 2;

  const allowed = ['ativo', 'api_key', 'model', 'system_prompt', 'temperatura', 'max_tokens'];
  for (const key of allowed) {
    if (body[key] !== undefined) {
      // Ignora api_key mascarada com bullet points
      if (key === 'api_key' && typeof body[key] === 'string' && body[key].includes('\u2022')) {
        continue;
      }
      fields.push(`${key} = $${idx++}`);
      values.push(body[key]);
    }
  }

  fields.push(`atualizado_em = now()`);

  await db.none(
    `INSERT INTO config_iris (tenant_id) VALUES ($1)
     ON CONFLICT (tenant_id) DO UPDATE SET ${fields.join(', ')}`,
    values
  );

  return getConfigIris(tenantId);
}
