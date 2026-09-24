import express from 'express';
import db from '../db.js';
import { PERMISSIONS, requirePermission } from '../auth/permissions.js';

const router = express.Router();
const TIPOS_CANAL = new Set(['whatsapp_baileys', 'whatsapp_cloud_api', 'webchat', 'outro']);
const ESTRATEGIAS_ROTEAMENTO = new Set(['menor_carga', 'round_robin', 'manual', 'por_regra']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const validarUuid = (req, res, next, valor) => {
  if (!UUID_RE.test(valor)) return res.status(400).json({ erro: 'Identificador inválido' });
  next();
};
router.param('id', validarUuid);
router.param('departamentoId', validarUuid);

router.param('versao', (req, res, next, valor) => {
  if (!/^[1-9]\d*$/.test(valor)) return res.status(400).json({ erro: 'Versão inválida' });
  next();
});

async function auditar(t, req, acao, entidade, entidadeId, detalhe = {}) {
  await t.none(
    `INSERT INTO auditoria (tenant_id, operador_id, acao, detalhe, origem, entidade, entidade_id)
     VALUES ($1,$2,$3,$4,'usuario',$5,$6)`,
    [req.operador.tenantId, req.operador.id, acao, detalhe, entidade, entidadeId]
  );
}

router.get('/permissoes', (_req, res) => res.json(PERMISSIONS));

router.get('/canais', requirePermission(PERMISSIONS.CHANNELS_MANAGE), async (req, res) => {
  const rows = await db.manyOrNone(
    `SELECT id, nome, tipo, numero, situacao, conectado_em, ultima_atividade_em,
            webhook_url, erro_codigo, erro_detalhe, ativo, criado_em, atualizado_em,
            (segredo_criptografado IS NOT NULL) AS segredo_configurado
     FROM canais_atendimento WHERE tenant_id = $1 AND ativo = true ORDER BY nome`,
    [req.operador.tenantId]
  );
  res.json(rows);
});

router.post('/canais', requirePermission(PERMISSIONS.CHANNELS_MANAGE), async (req, res) => {
  try {
    const { nome, tipo, numero, webhook_url } = req.body;
    if (!nome || !tipo) return res.status(400).json({ erro: 'Nome e tipo são obrigatórios' });
    if (!TIPOS_CANAL.has(tipo)) return res.status(400).json({ erro: 'Tipo de canal inválido' });
    const row = await db.one(
      `INSERT INTO canais_atendimento (tenant_id, nome, tipo, numero, webhook_url)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id, nome, tipo, numero, situacao, webhook_url, ativo, criado_em`,
      [req.operador.tenantId, nome.trim(), tipo, numero || null, webhook_url || null]
    );
    res.status(201).json(row);
  } catch (err) {
    res.status(err.code === '23514' ? 400 : 500).json({ erro: err.message });
  }
});

router.put('/canais/:id', requirePermission(PERMISSIONS.CHANNELS_MANAGE), async (req, res) => {
  const { nome, tipo, numero, webhook_url, horario_id, departamento_ids = [], operador_ids = [] } = req.body;
  if (tipo && !TIPOS_CANAL.has(tipo)) return res.status(400).json({ erro: 'Tipo de canal inválido' });
  const row = await db.tx(async (t) => {
    const canal = await t.oneOrNone(
      `UPDATE canais_atendimento SET nome = COALESCE($1,nome), tipo = COALESCE($2,tipo),
         numero = $3, webhook_url = $4, horario_id = $5, atualizado_em = now()
       WHERE id = $6 AND tenant_id = $7 AND ativo = true
       RETURNING id, nome, tipo, numero, situacao, webhook_url, horario_id, atualizado_em`,
      [nome?.trim() || null, tipo || null, numero || null, webhook_url || null, horario_id || null,
        req.params.id, req.operador.tenantId]
    );
    if (!canal) return null;
    await t.none('DELETE FROM canal_departamentos WHERE canal_id = $1', [canal.id]);
    await t.none('DELETE FROM canal_operadores WHERE canal_id = $1', [canal.id]);
    for (const departamentoId of departamento_ids) {
      await t.none(
        `INSERT INTO canal_departamentos (canal_id, departamento_id)
         SELECT $1, id FROM departamentos WHERE id = $2 AND tenant_id = $3 AND ativo = true
         ON CONFLICT DO NOTHING`,
        [canal.id, departamentoId, req.operador.tenantId]
      );
    }
    for (const operadorId of operador_ids) {
      await t.none(
        `INSERT INTO canal_operadores (canal_id, operador_id)
         SELECT $1, id FROM operadores WHERE id = $2 AND tenant_id = $3 AND ativo = true
         ON CONFLICT DO NOTHING`,
        [canal.id, operadorId, req.operador.tenantId]
      );
    }
    await auditar(t, req, 'canal.atualizado', 'canal', canal.id, { departamento_ids, operador_ids });
    return canal;
  });
  if (!row) return res.status(404).json({ erro: 'Canal não encontrado' });
  res.json(row);
});

router.post('/canais/:id/diagnostico', requirePermission(PERMISSIONS.CHANNELS_MANAGE), async (req, res) => {
  const canal = await db.oneOrNone(
    `SELECT id, nome, tipo, situacao, webhook_url, (segredo_criptografado IS NOT NULL) segredo_configurado
     FROM canais_atendimento WHERE id = $1 AND tenant_id = $2 AND ativo = true`,
    [req.params.id, req.operador.tenantId]
  );
  if (!canal) return res.status(404).json({ erro: 'Canal não encontrado' });
  const requisitos = {
    cadastro: true,
    webhook: canal.tipo !== 'whatsapp_cloud_api' || Boolean(canal.webhook_url),
    credencial: canal.tipo === 'whatsapp_baileys' || canal.tipo === 'webchat' || canal.segredo_configurado,
  };
  res.json({
    canal_id: canal.id,
    ambiente: process.env.NODE_ENV,
    modo: process.env.NODE_ENV === 'development' ? 'simulado' : 'somente_leitura',
    pronto: Object.values(requisitos).every(Boolean),
    requisitos,
    mensagem: process.env.NODE_ENV === 'development'
      ? 'Diagnóstico seguro: nenhuma mensagem externa foi enviada.'
      : 'Diagnóstico não invasivo concluído.',
  });
});

router.post('/canais/:id/desconectar', requirePermission(PERMISSIONS.CHANNELS_MANAGE), async (req, res) => {
  const motivo = String(req.body.motivo || '').trim();
  if (!motivo) return res.status(400).json({ erro: 'Motivo obrigatório' });
  const row = await db.tx(async (t) => {
    const canal = await t.oneOrNone(
      `UPDATE canais_atendimento SET situacao = 'desconectado', atualizado_em = now()
       WHERE id = $1 AND tenant_id = $2 RETURNING id, nome, situacao`,
      [req.params.id, req.operador.tenantId]
    );
    if (!canal) return null;
    await t.none(
      `INSERT INTO canal_eventos (tenant_id, canal_id, tipo, motivo, operador_id)
       VALUES ($1,$2,'desconectado',$3,$4)`,
      [req.operador.tenantId, canal.id, motivo, req.operador.id]
    );
    await t.none(
      `INSERT INTO auditoria (tenant_id, operador_id, acao, detalhe, origem, entidade, entidade_id)
       VALUES ($1,$2,'canal.desconectado',$3,'usuario','canal',$4)`,
      [req.operador.tenantId, req.operador.id, { motivo }, canal.id]
    );
    return canal;
  });
  if (!row) return res.status(404).json({ erro: 'Canal não encontrado' });
  res.json(row);
});

router.get('/horarios', requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req, res) => {
  res.json(await db.manyOrNone(
    `SELECT * FROM horarios_atendimento WHERE tenant_id = $1 AND ativo = true ORDER BY nome`,
    [req.operador.tenantId]
  ));
});

router.post('/horarios', requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req, res) => {
  const { nome, timezone = 'America/Sao_Paulo', periodos = {}, mensagem_ausencia, repeticao_minutos = 720 } = req.body;
  if (!String(nome || '').trim()) return res.status(400).json({ erro: 'Nome obrigatório' });
  if (!periodos || typeof periodos !== 'object' || Array.isArray(periodos)) {
    return res.status(400).json({ erro: 'Períodos inválidos' });
  }
  const row = await db.one(
    `INSERT INTO horarios_atendimento
       (tenant_id,nome,timezone,periodos,mensagem_ausencia,repeticao_minutos)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [req.operador.tenantId, nome.trim(), timezone, periodos, mensagem_ausencia || null,
      Math.max(Number(repeticao_minutos) || 720, 1)]
  );
  res.status(201).json(row);
});

router.put('/horarios/:id', requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req, res) => {
  const { nome, timezone, periodos, mensagem_ausencia, repeticao_minutos } = req.body;
  if (!periodos || typeof periodos !== 'object') return res.status(400).json({ erro: 'Períodos inválidos' });
  const row = await db.oneOrNone(
    `UPDATE horarios_atendimento SET nome = COALESCE($1,nome), timezone = COALESCE($2,timezone),
       periodos = $3, mensagem_ausencia = $4,
       repeticao_minutos = COALESCE($5,repeticao_minutos), atualizado_em = now()
     WHERE id = $6 AND tenant_id = $7 RETURNING *`,
    [nome || null, timezone || null, periodos, mensagem_ausencia || null, repeticao_minutos || null, req.params.id, req.operador.tenantId]
  );
  if (!row) return res.status(404).json({ erro: 'Horário não encontrado' });
  res.json(row);
});

router.get('/sla', requirePermission(PERMISSIONS.REPORTS_VIEW), async (req, res) => {
  res.json(await db.manyOrNone(
    `SELECT s.*, d.nome AS departamento_nome
     FROM sla_configuracoes s LEFT JOIN departamentos d ON d.id = s.departamento_id
     WHERE s.tenant_id = $1 ORDER BY d.nome NULLS FIRST`,
    [req.operador.tenantId]
  ));
});

router.put('/sla/departamentos/:departamentoId', requirePermission(PERMISSIONS.DEPARTMENTS_MANAGE), async (req, res) => {
  const { primeira_resposta_minutos, resolucao_minutos, usar_horario_util, horario_id, alerta_percentual, escalonamento } = req.body;
  if (Number(primeira_resposta_minutos) <= 0 || Number(resolucao_minutos) <= 0) {
    return res.status(400).json({ erro: 'Prazos de SLA devem ser positivos' });
  }
  const row = await db.one(
    `INSERT INTO sla_configuracoes
       (tenant_id, departamento_id, primeira_resposta_minutos, resolucao_minutos,
        usar_horario_util, horario_id, alerta_percentual, escalonamento)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (tenant_id, departamento_id) DO UPDATE SET
       primeira_resposta_minutos = EXCLUDED.primeira_resposta_minutos,
       resolucao_minutos = EXCLUDED.resolucao_minutos,
       usar_horario_util = EXCLUDED.usar_horario_util,
       horario_id = EXCLUDED.horario_id,
       alerta_percentual = EXCLUDED.alerta_percentual,
       escalonamento = EXCLUDED.escalonamento
     RETURNING *`,
    [
      req.operador.tenantId, req.params.departamentoId, primeira_resposta_minutos,
      resolucao_minutos, usar_horario_util !== false, horario_id || null,
      alerta_percentual || 80, JSON.stringify(escalonamento || []),
    ]
  );
  res.json(row);
});

router.get('/roteamento', requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req, res) => {
  res.json(await db.manyOrNone(
    `SELECT r.*, d.nome AS departamento_nome
     FROM roteamento_configuracoes r LEFT JOIN departamentos d ON d.id = r.departamento_id
     WHERE r.tenant_id = $1 AND r.ativo = true ORDER BY d.nome NULLS FIRST`,
    [req.operador.tenantId]
  ));
});

router.put('/roteamento/departamentos/:departamentoId', requirePermission(PERMISSIONS.DEPARTMENTS_MANAGE), async (req, res) => {
  const { estrategia = 'menor_carga', limite_carga_padrao = 10, regras = {} } = req.body;
  if (!ESTRATEGIAS_ROTEAMENTO.has(estrategia)) {
    return res.status(400).json({ erro: 'Estratégia de roteamento inválida' });
  }
  if (Number(limite_carga_padrao) < 1 || Number(limite_carga_padrao) > 100) {
    return res.status(400).json({ erro: 'Limite de carga deve estar entre 1 e 100' });
  }
  const row = await db.one(
    `INSERT INTO roteamento_configuracoes
       (tenant_id,departamento_id,estrategia,limite_carga_padrao,regras)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (tenant_id,departamento_id) DO UPDATE SET
       estrategia = EXCLUDED.estrategia, limite_carga_padrao = EXCLUDED.limite_carga_padrao,
       regras = EXCLUDED.regras, ativo = true
     RETURNING *`,
    [req.operador.tenantId, req.params.departamentoId, estrategia, limite_carga_padrao, regras]
  );
  res.json(row);
});

router.get('/retencao', requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req, res) => {
  const row = await db.oneOrNone(
    'SELECT * FROM politicas_retencao WHERE tenant_id = $1',
    [req.operador.tenantId]
  );
  res.json(row || {
    dias_conversas: null, dias_midias: null, dias_auditoria: null, modo: 'arquivar', ativo: false,
  });
});

router.put('/retencao', requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req, res) => {
  const { dias_conversas, dias_midias, dias_auditoria, ativo = false } = req.body;
  const valores = [dias_conversas, dias_midias, dias_auditoria];
  if (valores.some((v) => v != null && (Number(v) < 30 || Number(v) > 3650))) {
    return res.status(400).json({ erro: 'Retenção deve ficar entre 30 e 3650 dias' });
  }
  const row = await db.tx(async (t) => {
    const politica = await t.one(
      `INSERT INTO politicas_retencao
         (tenant_id,dias_conversas,dias_midias,dias_auditoria,modo,ativo,atualizado_por)
       VALUES ($1,$2,$3,$4,'arquivar',$5,$6)
       ON CONFLICT (tenant_id) DO UPDATE SET dias_conversas=EXCLUDED.dias_conversas,
         dias_midias=EXCLUDED.dias_midias,dias_auditoria=EXCLUDED.dias_auditoria,
         modo='arquivar',ativo=EXCLUDED.ativo,atualizado_por=EXCLUDED.atualizado_por,
         atualizado_em=now() RETURNING *`,
      [req.operador.tenantId, dias_conversas || null, dias_midias || null,
        dias_auditoria || null, ativo, req.operador.id]
    );
    await auditar(t, req, 'retencao.atualizada', 'politica_retencao', req.operador.tenantId,
      { dias_conversas, dias_midias, dias_auditoria, ativo, modo: 'arquivar' });
    return politica;
  });
  res.json(row);
});

router.get('/iris/prompts', requirePermission(PERMISSIONS.IRIS_MANAGE), async (req, res) => {
  res.json(await db.manyOrNone(
    `SELECT id,versao,instrucoes_sistema,fontes_autorizadas,limite_confianca,situacao,
            criado_em,publicado_em FROM iris_prompt_versoes
     WHERE tenant_id=$1 ORDER BY versao DESC`,
    [req.operador.tenantId]
  ));
});

router.post('/iris/prompts', requirePermission(PERMISSIONS.IRIS_MANAGE), async (req, res) => {
  const { instrucoes_sistema, fontes_autorizadas = [], limite_confianca = 0.7 } = req.body;
  if (String(instrucoes_sistema || '').trim().length < 20) {
    return res.status(400).json({ erro: 'As instruções devem ter ao menos 20 caracteres' });
  }
  const row = await db.tx(async (t) => {
    await t.one('SELECT pg_advisory_xact_lock(hashtext($1))', [`iris:${req.operador.tenantId}`]);
    return t.one(
      `INSERT INTO iris_prompt_versoes
         (tenant_id,versao,instrucoes_sistema,fontes_autorizadas,limite_confianca,criado_por)
       SELECT $1,COALESCE(MAX(versao),0)+1,$2,$3,$4,$5
       FROM iris_prompt_versoes WHERE tenant_id=$1 RETURNING *`,
      [req.operador.tenantId, instrucoes_sistema.trim(), JSON.stringify(fontes_autorizadas),
        Math.min(Math.max(Number(limite_confianca) || 0.7, 0), 1), req.operador.id]
    );
  });
  res.status(201).json(row);
});

router.post('/iris/prompts/:id/publicar', requirePermission(PERMISSIONS.IRIS_MANAGE), async (req, res) => {
  const row = await db.tx(async (t) => {
    const existe = await t.oneOrNone(
      'SELECT id FROM iris_prompt_versoes WHERE id=$1 AND tenant_id=$2',
      [req.params.id, req.operador.tenantId]
    );
    if (!existe) return null;
    await t.none(
      `UPDATE iris_prompt_versoes SET situacao='arquivado'
       WHERE tenant_id=$1 AND situacao='publicado'`,
      [req.operador.tenantId]
    );
    const prompt = await t.oneOrNone(
      `UPDATE iris_prompt_versoes SET situacao='publicado',aprovado_por=$1,publicado_em=now()
       WHERE id=$2 AND tenant_id=$3 RETURNING *`,
      [req.operador.id, req.params.id, req.operador.tenantId]
    );
    if (prompt) await auditar(t, req, 'iris.prompt_publicado', 'iris_prompt', prompt.id, { versao: prompt.versao });
    return prompt;
  });
  if (!row) return res.status(404).json({ erro: 'Versão não encontrada' });
  res.json(row);
});

router.post('/iris/simular', requirePermission(PERMISSIONS.IRIS_MANAGE), async (req, res) => {
  const mensagem = String(req.body.mensagem || '').trim();
  if (!mensagem) return res.status(400).json({ erro: 'Mensagem obrigatória' });
  const prompt = await db.oneOrNone(
    `SELECT id,versao,limite_confianca FROM iris_prompt_versoes
     WHERE tenant_id=$1 AND situacao='publicado' ORDER BY versao DESC LIMIT 1`,
    [req.operador.tenantId]
  );
  res.json({
    modo: 'simulador_dev',
    prompt_versao: prompt?.versao || null,
    decisao: prompt ? 'sugerir_resposta' : 'encaminhar_humano',
    confianca: prompt ? Math.max(Number(prompt.limite_confianca), 0.82) : 0,
    resposta: prompt
      ? `Simulação Iris: recebi "${mensagem.slice(0, 120)}". Confirme os dados antes de enviar ao cidadão.`
      : 'Publique uma versão de prompt antes de simular.',
    enviou_ao_cidadao: false,
  });
});

router.get('/chatbot/fluxos', requirePermission(PERMISSIONS.CHATBOT_MANAGE), async (req, res) => {
  res.json(await db.manyOrNone(
    `SELECT f.*, COALESCE(json_agg(v ORDER BY v.versao DESC)
       FILTER (WHERE v.id IS NOT NULL),'[]') versoes
     FROM chatbot_fluxos f LEFT JOIN chatbot_fluxo_versoes v ON v.fluxo_id=f.id
     WHERE f.tenant_id=$1 AND f.ativo=true GROUP BY f.id ORDER BY f.nome`,
    [req.operador.tenantId]
  ));
});

router.post('/chatbot/fluxos', requirePermission(PERMISSIONS.CHATBOT_MANAGE), async (req, res) => {
  const { nome, definicao = { inicio: { mensagem: 'Olá! Como podemos ajudar?' } }, canal_id } = req.body;
  if (!String(nome || '').trim()) return res.status(400).json({ erro: 'Nome obrigatório' });
  const row = await db.tx(async (t) => {
    const fluxo = await t.one(
      `INSERT INTO chatbot_fluxos (tenant_id,nome,canal_id) VALUES ($1,$2,$3) RETURNING *`,
      [req.operador.tenantId, nome.trim(), canal_id || null]
    );
    await t.none(
      `INSERT INTO chatbot_fluxo_versoes (tenant_id,fluxo_id,versao,definicao,validacao)
       VALUES ($1,$2,1,$3,$4)`,
      [req.operador.tenantId, fluxo.id, definicao, { valido: true, erros: [] }]
    );
    return fluxo;
  });
  res.status(201).json(row);
});

router.post('/chatbot/fluxos/:id/versoes', requirePermission(PERMISSIONS.CHATBOT_MANAGE), async (req, res) => {
  const definicao = req.body.definicao;
  if (!definicao || typeof definicao !== 'object' || Array.isArray(definicao)) {
    return res.status(400).json({ erro: 'Definição inválida' });
  }
  const row = await db.tx(async (t) => {
    await t.one('SELECT pg_advisory_xact_lock(hashtext($1))', [`chatbot:${req.params.id}`]);
    return t.oneOrNone(
      `INSERT INTO chatbot_fluxo_versoes (tenant_id,fluxo_id,versao,definicao,validacao)
       SELECT $1,f.id,COALESCE(MAX(v.versao),0)+1,$3,$4
       FROM chatbot_fluxos f LEFT JOIN chatbot_fluxo_versoes v ON v.fluxo_id=f.id
       WHERE f.id=$2 AND f.tenant_id=$1 GROUP BY f.id RETURNING *`,
      [req.operador.tenantId, req.params.id, definicao, { valido: true, erros: [] }]
    );
  });
  if (!row) return res.status(404).json({ erro: 'Fluxo não encontrado' });
  res.status(201).json(row);
});

router.post('/chatbot/fluxos/:id/publicar/:versao', requirePermission(PERMISSIONS.CHATBOT_MANAGE), async (req, res) => {
  const row = await db.tx(async (t) => {
    const versao = await t.oneOrNone(
      `UPDATE chatbot_fluxo_versoes SET publicado_por=$1,publicado_em=now()
       WHERE fluxo_id=$2 AND versao=$3 AND tenant_id=$4 RETURNING *`,
      [req.operador.id, req.params.id, Number(req.params.versao), req.operador.tenantId]
    );
    if (!versao) return null;
    await t.none(
      `UPDATE chatbot_fluxos SET situacao='publicado',versao_publicada=$1,atualizado_em=now()
       WHERE id=$2 AND tenant_id=$3`,
      [versao.versao, req.params.id, req.operador.tenantId]
    );
    await auditar(t, req, 'chatbot.fluxo_publicado', 'chatbot_fluxo', req.params.id, { versao: versao.versao });
    return versao;
  });
  if (!row) return res.status(404).json({ erro: 'Fluxo ou versão não encontrada' });
  res.json(row);
});

router.get('/diagnosticos', requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req, res) => {
  const [canais, falhas, prompt, fluxo] = await Promise.all([
    db.one('SELECT count(*)::int total, count(*) FILTER (WHERE situacao=$2)::int conectados FROM canais_atendimento WHERE tenant_id=$1 AND ativo=true', [req.operador.tenantId, 'conectado']),
    db.one("SELECT count(*)::int total FROM mensagens WHERE tenant_id=$1 AND status='falhou'", [req.operador.tenantId]),
    db.one("SELECT count(*)::int total FROM iris_prompt_versoes WHERE tenant_id=$1 AND situacao='publicado'", [req.operador.tenantId]),
    db.one("SELECT count(*)::int total FROM chatbot_fluxos WHERE tenant_id=$1 AND situacao='publicado' AND ativo=true", [req.operador.tenantId]),
  ]);
  res.json({
    ambiente: process.env.NODE_ENV,
    isolamento: process.env.NODE_ENV === 'development' ? 'interno_dev' : 'producao',
    servicos: {
      banco: { status: 'ok' },
      canais: { status: canais.total > 0 ? 'configurado' : 'pendente', ...canais },
      fila_mensagens: { status: falhas.total ? 'atencao' : 'ok', falhas: falhas.total },
      iris: { status: prompt.total ? 'configurado' : 'pendente', versoes_publicadas: prompt.total },
      chatbot: { status: fluxo.total ? 'configurado' : 'pendente', fluxos_publicados: fluxo.total },
      antivirus: { status: process.env.ANTIVIRUS_URL ? 'configurado' : 'adaptador_pendente_credencial' },
      transcricao: { status: process.env.TRANSCRIPTION_API_KEY ? 'configurado' : 'adaptador_pendente_credencial' },
      whatsapp_cloud: { status: process.env.WHATSAPP_CLOUD_TOKEN ? 'configurado' : 'adaptador_pendente_credencial' },
      saas_2fa: { status: 'responsabilidade_saas' },
    },
  });
});

router.post('/massa-sintetica', requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req, res) => {
  if (process.env.NODE_ENV !== 'development') {
    return res.status(404).json({ erro: 'Disponível somente no ambiente de desenvolvimento' });
  }
  const resultado = await db.tx(async (t) => {
    const horario = await t.one(
      `WITH existente AS (
         SELECT id FROM horarios_atendimento
         WHERE tenant_id=$1 AND nome='Expediente municipal (sintético)' AND ativo=true LIMIT 1
       ), inserido AS (
         INSERT INTO horarios_atendimento (tenant_id,nome,periodos,mensagem_ausencia)
         SELECT $1,'Expediente municipal (sintético)',
           '{"seg":[["08:00","17:00"]],"ter":[["08:00","17:00"]],"qua":[["08:00","17:00"]],"qui":[["08:00","17:00"]],"sex":[["08:00","17:00"]]}'::jsonb,
           'Atendimento fora do expediente. Retornaremos no próximo dia útil.'
         WHERE NOT EXISTS (SELECT 1 FROM existente)
         RETURNING id
       )
       SELECT id FROM inserido UNION ALL SELECT id FROM existente LIMIT 1`,
      [req.operador.tenantId]
    );
    await t.none(
      `INSERT INTO canais_atendimento (tenant_id,nome,tipo,numero,situacao,horario_id)
       SELECT $1,'WhatsApp DEV simulado','whatsapp_cloud_api','+5511999990000','desconectado',$2
       WHERE NOT EXISTS (SELECT 1 FROM canais_atendimento WHERE tenant_id=$1 AND nome='WhatsApp DEV simulado')`,
      [req.operador.tenantId, horario.id]
    );
    const departamentos = await t.manyOrNone(
      'SELECT id FROM departamentos WHERE tenant_id=$1 AND ativo=true',
      [req.operador.tenantId]
    );
    for (const departamento of departamentos) {
      await t.none(
        `INSERT INTO sla_configuracoes (tenant_id,departamento_id,primeira_resposta_minutos,resolucao_minutos,horario_id)
         VALUES ($1,$2,30,480,$3) ON CONFLICT (tenant_id,departamento_id) DO NOTHING`,
        [req.operador.tenantId, departamento.id, horario.id]
      );
      await t.none(
        `INSERT INTO roteamento_configuracoes (tenant_id,departamento_id,estrategia,limite_carga_padrao)
         VALUES ($1,$2,'menor_carga',10) ON CONFLICT (tenant_id,departamento_id) DO NOTHING`,
        [req.operador.tenantId, departamento.id]
      );
    }
    await auditar(t, req, 'dev.massa_sintetica_criada', 'ambiente_dev', req.operador.tenantId,
      { sem_dados_pessoais: true });
    return { horario_id: horario.id, departamentos_configurados: departamentos.length };
  });
  res.json({ ...resultado, ambiente: 'development', dados_pessoais: false });
});

router.get('/mensagens/falhas', requirePermission(PERMISSIONS.CONVERSAS_VIEW), async (req, res) => {
  res.json(await db.manyOrNone(
    `SELECT m.id, m.conversa_id, m.tipo, m.conteudo, m.falha_codigo, m.falha_detalhe,
            m.tentativas, m.criado_em, c.status_operacional
     FROM mensagens m JOIN conversas c ON c.id = m.conversa_id
     WHERE m.tenant_id = $1 AND m.status = 'falhou'
     ORDER BY m.criado_em DESC LIMIT 200`,
    [req.operador.tenantId]
  ));
});

router.get('/auditoria', requirePermission(PERMISSIONS.AUDIT_VIEW), async (req, res) => {
  const limite = Math.min(Math.max(Number(req.query.limite) || 100, 1), 500);
  res.json(await db.manyOrNone(
    `SELECT a.*, o.nome AS operador_nome FROM auditoria a
     LEFT JOIN operadores o ON o.id = a.operador_id
     WHERE a.tenant_id = $1 ORDER BY a.criado_em DESC LIMIT $2`,
    [req.operador.tenantId, limite]
  ));
});

export default router;
