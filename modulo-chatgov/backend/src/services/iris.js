import db from '../db.js';

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

async function obterInfoFila(tenantId, departamentoSugerido) {
  try {
    // Atendentes online por departamento
    const onlinePorDepto = await db.manyOrNone(
      `SELECT d.id, d.nome, COUNT(o.id)::int AS online,
              COUNT(c.id) FILTER (WHERE c.status = 'fila')::int AS na_fila
       FROM departamentos d
       LEFT JOIN operador_departamentos od ON od.departamento_id = d.id
       LEFT JOIN operadores o ON o.id = od.operador_id AND o.online = true
       LEFT JOIN conversas c ON c.departamento_id = d.id AND c.status = 'fila' AND c.tenant_id = $1
       WHERE d.tenant_id = $1 AND d.ativo = true
       GROUP BY d.id, d.nome
       ORDER BY d.nome`,
      [tenantId]
    );

    // Contagem total na fila (sem departamento ou recepção)
    const totalFila = await db.one(
      `SELECT COUNT(*)::int AS total
       FROM conversas
       WHERE tenant_id = $1
         AND status = 'fila'
         AND operador_id IS NULL`,
      [tenantId]
    );

    // Tempo médio de espera (últimas 100 conversas resolvidas)
    const tempoMedio = await db.oneOrNone(
      `SELECT AVG(EXTRACT(EPOCH FROM (ultima_mensagem_em - criado_em)))::int AS segundos
       FROM conversas
       WHERE tenant_id = $1
         AND status = 'resolvida'
         AND operador_id IS NOT NULL
         AND criado_em > now() - INTERVAL '30 days'
       ORDER BY criado_em DESC
       LIMIT 100`,
      [tenantId]
    );

    // Posição na fila do cidadão atual (se departamento sugerido)
    let posicaoFila = null;
    if (departamentoSugerido) {
      const pos = await db.oneOrNone(
        `SELECT COUNT(*)::int AS posicao
         FROM conversas
         WHERE tenant_id = $1
           AND status = 'fila'
           AND operador_id IS NULL
           AND departamento_id = $2
           AND criado_em < (SELECT criado_em FROM conversas WHERE departamento_sugerido = $2 AND tenant_id = $1 LIMIT 1)`,
        [tenantId, departamentoSugerido]
      );
      if (pos) posicaoFila = pos.posicao + 1;
    }

    return {
      onlinePorDepto,
      totalFila: totalFila?.total || 0,
      tempoMedioSegundos: tempoMedio?.segundos || null,
      posicaoFila,
    };
  } catch (err) {
    console.error('[Iris] Erro ao obter info de fila:', err.message);
    return {
      onlinePorDepto: [],
      totalFila: 0,
      tempoMedioSegundos: null,
      posicaoFila: null,
    };
  }
}

function buildSystemPrompt(tenantNome, secretarias, departamentos, infoFila) {
  const deptos = departamentos.map((d) => {
    const sec = secretarias.find((s) => s.id === d.secretaria_id);
    const prefix = sec ? `${sec.nome} › ` : '';
    const filaInfo = infoFila?.onlinePorDepto?.find((f) => f.id === d.id);
    const online = filaInfo?.online || 0;
    const naFila = filaInfo?.na_fila || 0;
    const disponibilidade = online > 0
      ? `${online} atendente(s) online, ${naFila} na fila`
      : `nenhum atendente online, ${naFila} na fila`;
    return `  - "${d.nome}" (id: ${d.id})${prefix ? ` — ${prefix.slice(0, -3)}` : ''} [${disponibilidade}]`;
  }).join('\n');

  const deptosCompact = departamentos.map((d) => {
    const sec = secretarias.find((s) => s.id === d.secretaria_id);
    const filaInfo = infoFila?.onlinePorDepto?.find((f) => f.id === d.id);
    return {
      id: d.id,
      nome: d.nome,
      secretaria: sec?.nome || 'Geral',
      atendentes_online: filaInfo?.online || 0,
      conversas_na_fila: filaInfo?.na_fila || 0,
    };
  });

  const tempoEstimado = infoFila?.tempoMedioSegundos
    ? `${Math.ceil(infoFila.tempoMedioSegundos / 60)} minutos`
    : 'alguns minutos';

  const infoPosicao = infoFila?.posicaoFila
    ? `\nO cidadao e o ${infoFila.posicaoFila}º na fila do departamento sugerido. Informe isso a ele se perguntar.`
    : '';

  const infoFilaTexto = infoFila?.totalFila > 0
    ? `\nHa ${infoFila.totalFila} conversas aguardando na fila geral. O tempo medio de espera e de ${tempoEstimado}.`
    : '';

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
8. Priorize departamentos COM ATENDENTES ONLINE. Se dois departamentos servem, escolha o que tem atendente disponivel.
9. Se o cidadao perguntar sobre tempo de espera, informe com base nos dados disponiveis.${infoPosicao}${infoFilaTexto}

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

/**
 * Tenta extrair nome de departamento do texto bruto usando similaridade.
 */
function extrairDepartamentoDoTexto(textoBruto, departamentos) {
  if (!textoBruto || departamentos.length === 0) return null;

  const textoLower = textoBruto.toLowerCase();

  // Estratégia 1: busca exata do nome
  for (const d of departamentos) {
    if (textoLower.includes(d.nome.toLowerCase())) {
      return d.id;
    }
  }

  // Estratégia 2: busca por nome da secretaria
  for (const d of departamentos) {
    if (d.secretaria_nome && textoLower.includes(d.secretaria_nome.toLowerCase())) {
      return d.id;
    }
  }

  // Estratégia 3: palavras-chave comuns -> departamento
  const mapaKeywords = {
    'saude': ['saúde', 'saude', 'hospital', 'posto', 'ubs', 'medico', 'médico', 'vacina', 'consulta', 'exame', 'sus', 'sintoma', 'doença', 'doenca', 'remédio', 'remedio', 'farmacia', 'farmácia'],
    'educação': ['educação', 'educacao', 'escola', 'creche', 'professor', 'aluno', 'matricula', 'matrícula', 'ensino', 'vaga'],
    'tributos': ['iptu', 'iss', 'imposto', 'taxa', 'tributo', 'boleto', 'cobrança', 'cobranca', 'divida', 'dívida', 'parcela', 'certidão', 'certidao'],
    'obras': ['obra', 'asfalto', 'tapa-buraco', 'buraco', 'pavimentação', 'pavimentacao', 'iluminação', 'iluminacao', 'saneamento', 'calçada', 'calcada'],
    'assistência social': ['assistência', 'assistencia', 'social', 'cesta', 'bolsa', 'cadunico', 'cadúnico', 'beneficio', 'benefício', 'vulnerabilidade'],
    'meio ambiente': ['ambiente', 'lixo', 'coleta', 'reciclagem', 'reciclagem', 'poluição', 'poluicao', 'árvore', 'arvore', 'praça', 'praca', 'jardim'],
    'trânsito': ['trânsito', 'transito', 'multa', 'semaforo', 'semáforo', 'estacionamento', 'transporte', 'ônibus', 'onibus'],
    'protocolo': ['protocolo', 'documento', 'processo', 'requerimento', 'oficio', 'ofício'],
  };

  for (const d of departamentos) {
    const nome = d.nome.toLowerCase();
    for (const [deptoTipo, keywords] of Object.entries(mapaKeywords)) {
      if (nome.includes(deptoTipo)) {
        for (const kw of keywords) {
          if (textoLower.includes(kw)) return d.id;
        }
      }
    }
  }

  return null;
}

export async function processarComIris(tenantId, conversaId, texto) {
  const cfg = await db.oneOrNone(
    'SELECT * FROM config_iris WHERE tenant_id = $1 AND ativo = true',
    [tenantId]
  );
  if (!cfg) return null;

  // Verificar qual provider usar e se tem API key
  const provider = cfg.provider || 'deepseek';
  let apiKey;
  if (provider === 'deepseek') {
    apiKey = cfg.api_key;
    if (!apiKey) return null;
  } else if (provider === 'openai') {
    apiKey = cfg.openai_api_key || cfg.api_key; // fallback para campo antigo
    if (!apiKey) return null;
  }

  const tenant = await db.oneOrNone(
    'SELECT nome FROM tenants WHERE id = $1',
    [tenantId]
  );

  const secretarias = await db.manyOrNone(
    'SELECT id, nome FROM secretarias WHERE tenant_id = $1 ORDER BY nome',
    [tenantId]
  );

  // Buscar departamentos com nome da secretaria
  const departamentos = await db.manyOrNone(
    `SELECT d.id, d.nome, d.secretaria_id, s.nome AS secretaria_nome
     FROM departamentos d
     LEFT JOIN secretarias s ON s.id = d.secretaria_id
     WHERE d.tenant_id = $1 AND d.ativo = true
     ORDER BY d.nome`,
    [tenantId]
  );

  // Obter departamento_sugerido da conversa (contexto de mensagens anteriores)
  const conv = await db.oneOrNone(
    'SELECT departamento_sugerido FROM conversas WHERE id = $1 AND tenant_id = $2',
    [conversaId, tenantId]
  );

  // Obter informações da fila
  const infoFila = await obterInfoFila(tenantId, conv?.departamento_sugerido);

  const historico = await db.manyOrNone(
    `SELECT direcao, CASE WHEN direcao = 'entrada' THEN conteudo ELSE conteudo END as conteudo
     FROM mensagens
     WHERE conversa_id = $1 AND tenant_id = $2 AND tipo = 'texto'
     ORDER BY criado_em DESC LIMIT 15`,
    [conversaId, tenantId]
  );

  let systemPrompt = cfg.system_prompt || buildSystemPrompt(tenant?.nome, secretarias, departamentos, infoFila);

  if (cfg.system_prompt) {
    const deptosCompact = departamentos.map((d) => {
      const filaInfo = infoFila?.onlinePorDepto?.find((f) => f.id === d.id);
      return {
        id: d.id,
        nome: d.nome,
        secretaria: d.secretaria_nome || 'Geral',
        atendentes_online: filaInfo?.online || 0,
        conversas_na_fila: filaInfo?.na_fila || 0,
      };
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
    let response;

    if (provider === 'deepseek') {
      const body = JSON.stringify({
        model: cfg.model || 'deepseek-chat',
        messages,
        temperature: cfg.temperatura ?? 0.7,
        max_tokens: cfg.max_tokens ?? 1024,
        response_format: { type: 'json_object' },
      });

      const res = await fetch(DEEPSEEK_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Authorization': `Bearer ${apiKey}`,
        },
        body,
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error('[Iris] DeepSeek API error:', res.status, errText.slice(0, 300));
        return null;
      }

      const data = await res.json();
      response = data.choices?.[0]?.message?.content;
    } else if (provider === 'openai') {
      const body = JSON.stringify({
        model: cfg.openai_model || cfg.model || 'gpt-4o-mini',
        messages,
        temperature: cfg.temperatura ?? 0.7,
        max_tokens: cfg.max_tokens ?? 1024,
        response_format: { type: 'json_object' },
      });

      const res = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Authorization': `Bearer ${apiKey}`,
        },
        body,
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error('[Iris] OpenAI API error:', res.status, errText.slice(0, 300));
        return null;
      }

      const data = await res.json();
      response = data.choices?.[0]?.message?.content;
    } else {
      console.error('[Iris] Provider desconhecido:', provider);
      return null;
    }

    if (!response) return null;

    let parsed;
    try {
      parsed = JSON.parse(response);
    } catch {
      // Fallback inteligente: tenta extrair departamento do texto bruto
      const raw = (response || '').trim();
      console.log('[Iris] Resposta nao-JSON, usando fallback inteligente:', raw.slice(0, 120));

      const deptoDoTexto = extrairDepartamentoDoTexto(raw, departamentos);

      let deptoAlvo = deptoDoTexto;
      if (!deptoAlvo) {
        // Última tentativa: recepção
        const recepcao = await db.oneOrNone(
          "SELECT id FROM departamentos WHERE tenant_id = $1 AND LOWER(nome) = 'recepcao' AND ativo = true",
          [tenantId]
        );
        deptoAlvo = recepcao?.id || null;
      }

      const respostaFinal = raw
        ? raw.slice(0, 1000)
        : 'Desculpe, nao entendi sua mensagem. Poderia reformular, por favor?';

      return {
        respondido: true,
        resposta: respostaFinal,
        departamento_id: deptoAlvo,
        finalizado: true,
        origem: 'iris',
        confianca: deptoDoTexto ? 'media (extraido do texto)' : 'baixa (fallback)',
      };
    }

    console.log('[Iris] Resposta:', JSON.stringify({
      resposta: parsed.resposta?.slice(0, 80),
      departamento_id: parsed.departamento_id,
      finalizado: parsed.finalizado,
      provider,
    }));

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
          // Fallback: tentar extrair do texto da resposta
          console.log('[Iris] Departamento nao encontrado por nome, tentando fallback no texto');
          deptoValido = extrairDepartamentoDoTexto(
            parsed.resposta || '',
            departamentos
          );
        }
      }
    }

    // Se o departamento_id extraído do texto é o mesmo sugerido, é um bom sinal
    const confianca = deptoValido
      ? (conv?.departamento_sugerido === deptoValido ? 'alta' : 'normal')
      : 'sem roteamento';

    return {
      respondido: true,
      resposta: parsed.resposta || 'Desculpe, nao entendi. Um atendente ira ajuda-lo.',
      departamento_id: deptoValido,
      finalizado: parsed.finalizado !== false,
      origem: 'iris',
      confianca,
    };
  } catch (err) {
    console.error('[Iris] Erro ao processar:', err.message);
    return null;
  }
}

export async function getConfigIris(tenantId) {
  const cfg = await db.oneOrNone('SELECT * FROM config_iris WHERE tenant_id = $1', [tenantId]);
  if (!cfg) {
    return {
      ativo: false,
      provider: 'deepseek',
      model: 'deepseek-chat',
      openai_model: 'gpt-4o-mini',
      temperatura: 0.7,
      max_tokens: 1024,
    };
  }
  return cfg;
}

export async function saveConfigIris(tenantId, body) {
  const fields = [];
  const values = [tenantId];
  let idx = 2;

  const allowed = [
    'ativo', 'api_key', 'model', 'system_prompt', 'temperatura', 'max_tokens',
    'provider', 'openai_api_key', 'openai_model',
  ];
  for (const key of allowed) {
    if (body[key] !== undefined) {
      // Ignora api_key mascarada com bullet points
      if ((key === 'api_key' || key === 'openai_api_key') && typeof body[key] === 'string' && body[key].includes('\u2022')) {
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
