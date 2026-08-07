import express from 'express';
import db from '../db.js';
import { PERMISSIONS, requirePermission } from '../auth/permissions.js';

const router = express.Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── SERVIÇOS (catálogo) ─────────────────────────────────────

router.get('/services', requirePermission(PERMISSIONS.PROTOCOLOS_VIEW), async (req, res) => {
  const rows = await db.manyOrNone(
    `SELECT s.*, d.nome AS departamento_nome, sec.nome AS secretaria_nome,
            (SELECT COUNT(*)::int FROM protocolo_servico_campos WHERE servico_id = s.id) AS total_campos
     FROM protocolo_servicos s
     LEFT JOIN departamentos d ON d.id = s.departamento_id
     LEFT JOIN secretarias sec ON sec.id = s.secretaria_id
     WHERE s.tenant_id = $1
     ORDER BY s.ordem, s.nome`,
    [req.operador.tenantId]
  );
  res.json(rows);
});

router.post('/services', requirePermission(PERMISSIONS.PROTOCOLOS_ADMIN_SERVICES), async (req, res) => {
  try {
    const { nome, descricao, secretaria_id, departamento_id, categoria_id,
            prazo_estimado_dias, custo, publico_alvo, forma_atendimento,
            base_legal, instrucoes, mensagem_conclusao, nivel_autenticacao,
            precisa_cadastro, precisa_assinatura, prioridade_padrao, disponivel,
            ordem, campos } = req.body;

    if (!nome) return res.status(400).json({ erro: 'Nome obrigatório' });

    const servico = await db.one(
      `INSERT INTO protocolo_servicos
        (tenant_id, nome, descricao, secretaria_id, departamento_id, categoria_id,
         prazo_estimado_dias, custo, publico_alvo, forma_atendimento,
         base_legal, instrucoes, mensagem_conclusao, nivel_autenticacao,
         precisa_cadastro, precisa_assinatura, prioridade_padrao, disponivel, ordem)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING *`,
      [req.operador.tenantId, nome.trim(), descricao || null, secretaria_id || null,
       departamento_id || null, categoria_id || null,
       prazo_estimado_dias || null, custo || null, publico_alvo || null,
       forma_atendimento || null, base_legal || null, instrucoes || null,
       mensagem_conclusao || null, nivel_autenticacao || 'nenhum',
       precisa_cadastro || false, precisa_assinatura || false,
       prioridade_padrao || 'NORMAL', disponivel !== false, ordem || 0]
    );

    if (Array.isArray(campos)) {
      for (let i = 0; i < campos.length; i++) {
        const c = campos[i];
        await db.none(
          `INSERT INTO protocolo_servico_campos
            (tenant_id, servico_id, nome_campo, rotulo, tipo, obrigatorio, opcoes, placeholder, ajuda, validacao_regex, ordem)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [req.operador.tenantId, servico.id, c.nome_campo || `campo_${i+1}`,
           c.rotulo, c.tipo || 'texto', c.obrigatorio || false,
           c.opcoes ? JSON.stringify(c.opcoes) : null, c.placeholder || null,
           c.ajuda || null, c.validacao_regex || null, i]
        );
      }
    }

    res.status(201).json(servico);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

router.put('/services/:id', requirePermission(PERMISSIONS.PROTOCOLOS_ADMIN_SERVICES), async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) return res.status(400).json({ erro: 'ID inválido' });

    const { nome, descricao, secretaria_id, departamento_id, categoria_id,
            prazo_estimado_dias, disponivel, ordem, campos } = req.body;

    const servico = await db.oneOrNone(
      `UPDATE protocolo_servicos SET
         nome = COALESCE($1,nome), descricao = $2,
         secretaria_id = $3, departamento_id = $4, categoria_id = $5,
         prazo_estimado_dias = $6, disponivel = COALESCE($7,disponivel),
         ordem = COALESCE($8,ordem), atualizado_em = now()
       WHERE id = $9 AND tenant_id = $10
       RETURNING *`,
      [nome?.trim() || null, descricao || null, secretaria_id || null,
       departamento_id || null, categoria_id || null,
       prazo_estimado_dias || null, disponivel, ordem || 0,
       req.params.id, req.operador.tenantId]
    );
    if (!servico) return res.status(404).json({ erro: 'Serviço não encontrado' });

    if (Array.isArray(campos)) {
      await db.none(
        `DELETE FROM protocolo_servico_campos WHERE servico_id = $1 AND tenant_id = $2`,
        [servico.id, req.operador.tenantId]
      );
      for (let i = 0; i < campos.length; i++) {
        const c = campos[i];
        await db.none(
          `INSERT INTO protocolo_servico_campos
            (tenant_id, servico_id, nome_campo, rotulo, tipo, obrigatorio, opcoes, placeholder, ajuda, validacao_regex, ordem)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [req.operador.tenantId, servico.id, c.nome_campo || `campo_${i+1}`,
           c.rotulo, c.tipo || 'texto', c.obrigatorio || false,
           c.opcoes ? JSON.stringify(c.opcoes) : null, c.placeholder || null,
           c.ajuda || null, c.validacao_regex || null, i]
        );
      }
    }

    res.json(servico);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

router.delete('/services/:id', requirePermission(PERMISSIONS.PROTOCOLOS_ADMIN_SERVICES), async (req, res) => {
  if (!UUID_RE.test(req.params.id)) return res.status(400).json({ erro: 'ID inválido' });
  await db.none(
    `UPDATE protocolo_servicos SET ativo = false WHERE id = $1 AND tenant_id = $2`,
    [req.params.id, req.operador.tenantId]
  );
  res.json({ ok: true });
});

// ─── CATEGORIAS ──────────────────────────────────────────────

router.get('/categories', requirePermission(PERMISSIONS.PROTOCOLOS_VIEW), async (req, res) => {
  const rows = await db.manyOrNone(
    `SELECT * FROM protocolo_categorias WHERE tenant_id = $1 ORDER BY nome`,
    [req.operador.tenantId]
  );
  res.json(rows);
});

router.post('/categories', requirePermission(PERMISSIONS.PROTOCOLOS_ADMIN_CATEGORIES), async (req, res) => {
  const { nome, descricao, departamento_id } = req.body;
  if (!nome) return res.status(400).json({ erro: 'Nome obrigatório' });
  const row = await db.one(
    `INSERT INTO protocolo_categorias (tenant_id, nome, descricao, departamento_id)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [req.operador.tenantId, nome.trim(), descricao || null, departamento_id || null]
  );
  res.status(201).json(row);
});

router.delete('/categories/:id', requirePermission(PERMISSIONS.PROTOCOLOS_ADMIN_CATEGORIES), async (req, res) => {
  await db.none(
    `UPDATE protocolo_categorias SET ativo = false WHERE id = $1 AND tenant_id = $2`,
    [req.params.id, req.operador.tenantId]
  );
  res.json({ ok: true });
});

// ─── TIPOS ──────────────────────────────────────────────────

router.get('/types', requirePermission(PERMISSIONS.PROTOCOLOS_VIEW), async (req, res) => {
  const rows = await db.manyOrNone(
    `SELECT * FROM protocolo_tipos WHERE tenant_id = $1 ORDER BY nome`,
    [req.operador.tenantId]
  );
  res.json(rows);
});

router.post('/types', requirePermission(PERMISSIONS.PROTOCOLOS_ADMIN_TYPES), async (req, res) => {
  const { nome, descricao, prazo_padrao_dias, externo } = req.body;
  if (!nome) return res.status(400).json({ erro: 'Nome obrigatório' });
  const row = await db.one(
    `INSERT INTO protocolo_tipos (tenant_id, nome, descricao, prazo_padrao_dias, externo)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [req.operador.tenantId, nome.trim(), descricao || null, prazo_padrao_dias || null, externo !== false]
  );
  res.status(201).json(row);
});

// ─── SLAs ───────────────────────────────────────────────────

router.get('/slas', requirePermission(PERMISSIONS.PROTOCOLOS_VIEW), async (req, res) => {
  const rows = await db.manyOrNone(
    `SELECT sla.*, d.nome AS departamento_nome, s.nome AS servico_nome
     FROM sla_regras sla
     LEFT JOIN departamentos d ON d.id = sla.departamento_id
     LEFT JOIN protocolo_servicos s ON s.id = sla.servico_id
     WHERE sla.tenant_id = $1 AND sla.ativo = true
     ORDER BY sla.nome`,
    [req.operador.tenantId]
  );
  res.json(rows);
});

router.post('/slas', requirePermission(PERMISSIONS.PROTOCOLOS_ADMIN_SLA), async (req, res) => {
  const { nome, departamento_id, servico_id, prioridade, prazo_horas, considera_dias_uteis, suspende_ao_pendenciar } = req.body;
  if (!nome || !prazo_horas) return res.status(400).json({ erro: 'Nome e prazo_horas obrigatórios' });
  const row = await db.one(
    `INSERT INTO sla_regras (tenant_id, nome, departamento_id, servico_id, prioridade, prazo_horas, considera_dias_uteis, suspende_ao_pendenciar)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [req.operador.tenantId, nome.trim(), departamento_id || null, servico_id || null,
     prioridade || 'NORMAL', prazo_horas, considera_dias_uteis !== false, suspende_ao_pendenciar || false]
  );
  res.status(201).json(row);
});

router.put('/slas/:id', requirePermission(PERMISSIONS.PROTOCOLOS_ADMIN_SLA), async (req, res) => {
  const { nome, prazo_horas, considera_dias_uteis, suspende_ao_pendenciar } = req.body;
  const row = await db.oneOrNone(
    `UPDATE sla_regras SET nome = COALESCE($1,nome), prazo_horas = COALESCE($2,prazo_horas),
      considera_dias_uteis = COALESCE($3,considera_dias_uteis),
      suspende_ao_pendenciar = COALESCE($4,suspende_ao_pendenciar)
     WHERE id = $5 AND tenant_id = $6 RETURNING *`,
    [nome?.trim() || null, prazo_horas || null, considera_dias_uteis, suspende_ao_pendenciar,
     req.params.id, req.operador.tenantId]
  );
  if (!row) return res.status(404).json({ erro: 'SLA não encontrada' });
  res.json(row);
});

router.delete('/slas/:id', requirePermission(PERMISSIONS.PROTOCOLOS_ADMIN_SLA), async (req, res) => {
  await db.none(
    `UPDATE sla_regras SET ativo = false WHERE id = $1 AND tenant_id = $2`,
    [req.params.id, req.operador.tenantId]
  );
  res.json({ ok: true });
});

// ─── FERIADOS ───────────────────────────────────────────────

router.get('/holidays', requirePermission(PERMISSIONS.PROTOCOLOS_VIEW), async (req, res) => {
  const rows = await db.manyOrNone(
    `SELECT * FROM feriados WHERE tenant_id = $1 AND ativo = true ORDER BY data`,
    [req.operador.tenantId]
  );
  res.json(rows);
});

router.post('/holidays', requirePermission(PERMISSIONS.PROTOCOLOS_ADMIN_SLA), async (req, res) => {
  const { nome, data, tipo, recorrente } = req.body;
  if (!nome || !data) return res.status(400).json({ erro: 'Nome e data obrigatórios' });
  const row = await db.one(
    `INSERT INTO feriados (tenant_id, nome, data, tipo, recorrente)
     VALUES ($1,$2,$3,$4,$5) ON CONFLICT (tenant_id, data) DO UPDATE SET nome = $2 RETURNING *`,
    [req.operador.tenantId, nome.trim(), data, tipo || 'feriado', recorrente || false]
  );
  res.status(201).json(row);
});

router.delete('/holidays/:id', requirePermission(PERMISSIONS.PROTOCOLOS_ADMIN_SLA), async (req, res) => {
  await db.none(
    `UPDATE feriados SET ativo = false WHERE id = $1 AND tenant_id = $2`,
    [req.params.id, req.operador.tenantId]
  );
  res.json({ ok: true });
});

// ─── ETIQUETAS (TAGS) ───────────────────────────────────────

router.get('/tags', requirePermission(PERMISSIONS.PROTOCOLOS_VIEW), async (req, res) => {
  const rows = await db.manyOrNone(
    `SELECT * FROM protocolo_etiquetas WHERE tenant_id = $1 AND ativo = true ORDER BY nome`,
    [req.operador.tenantId]
  );
  res.json(rows);
});

router.post('/tags', requirePermission(PERMISSIONS.PROTOCOLOS_MANAGE), async (req, res) => {
  const { nome, cor } = req.body;
  if (!nome) return res.status(400).json({ erro: 'Nome obrigatório' });
  const row = await db.one(
    `INSERT INTO protocolo_etiquetas (tenant_id, nome, cor) VALUES ($1,$2,$3) RETURNING *`,
    [req.operador.tenantId, nome.trim(), cor || '#6B7280']
  );
  res.status(201).json(row);
});

router.delete('/tags/:id', requirePermission(PERMISSIONS.PROTOCOLOS_MANAGE), async (req, res) => {
  await db.none(`UPDATE protocolo_etiquetas SET ativo = false WHERE id = $1 AND tenant_id = $2`, [req.params.id, req.operador.tenantId]);
  res.json({ ok: true });
});

// ─── LGPD: Verificar retenção ───────────────────────────────
router.get('/lgpd/retention', requirePermission(PERMISSIONS.AUDIT_VIEW), async (req, res) => {
  try {
    const { verificarRetencao } = await import('../services/lgpd-protocolo.js');
    const result = await verificarRetencao(req.operador.tenantId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// ─── Cidadãos (busca para formulários) ──────────────────────
router.get('/citizens', requirePermission(PERMISSIONS.PROTOCOLOS_VIEW), async (req, res) => {
  try {
    const { busca } = req.query;
    if (!busca || busca.length < 2) return res.json([]);

    const pattern = `%${busca.replace(/[^a-zA-Z0-9]/g, '')}%`;
    // Busca em cidadaos + contatos (WhatsApp)
    const rows = await db.manyOrNone(
      `SELECT c.id, c.nome, c.nome_social, c.cpf, c.cnpj, c.telefone, c.email,
              c.tipo_pessoa, c.contato_id, c.criado_em,
              co.nome AS contato_nome, co.telefone AS contato_telefone, co.wa_jid AS contato_wa_jid,
              'cidadao' AS origem
       FROM cidadaos c
       LEFT JOIN contatos co ON co.id = c.contato_id
       WHERE c.tenant_id = $1
         AND (c.nome ILIKE $2
              OR REPLACE(REPLACE(REPLACE(c.cpf, '.', ''), '-', ''), '/', '') ILIKE $3
              OR REPLACE(REPLACE(REPLACE(c.cnpj, '.', ''), '-', ''), '/', '') ILIKE $3
              OR REPLACE(REPLACE(c.telefone, ' ', ''), '-', '') ILIKE $3
              OR c.email ILIKE $2)
         AND c.deleted_at IS NULL
       UNION ALL
       SELECT co.id::text AS id, co.nome, NULL AS nome_social, co.cpf, NULL AS cnpj, co.telefone, NULL AS email,
              'fisica' AS tipo_pessoa, co.id AS contato_id, co.criado_em,
              co.nome AS contato_nome, co.telefone AS contato_telefone, co.wa_jid AS contato_wa_jid,
              'contato' AS origem
       FROM contatos co
       WHERE co.tenant_id = $1
         AND (co.nome ILIKE $2 OR co.telefone ILIKE $2 OR co.cpf ILIKE $3)
         AND NOT EXISTS (SELECT 1 FROM cidadaos c WHERE c.contato_id = co.id AND c.tenant_id = $1)
       ORDER BY nome
       LIMIT 20`,
      [req.operador.tenantId, `%${busca}%`, pattern]
    );
    res.json(rows);
  } catch (err) {
    console.error('[admin/citizens]', err);
    res.status(500).json({ erro: 'Erro ao buscar cidadãos' });
  }
});

// ─── Atualizar dados do cidadão ──────────────────────────────
router.put('/citizens/:id', requirePermission(PERMISSIONS.PROTOCOLOS_EDIT), async (req, res) => {
  try {
    const { nome, nome_social, cpf, cnpj, telefone, email, contato_id } = req.body;
    const updates = [];
    const params = [req.params.id, req.operador.tenantId];
    let idx = 3;

    if (nome !== undefined) { updates.push(`nome = $${idx++}`); params.push(nome); }
    if (nome_social !== undefined) { updates.push(`nome_social = $${idx++}`); params.push(nome_social); }
    if (cpf !== undefined) { updates.push(`cpf = $${idx++}`); params.push(cpf); }
    if (cnpj !== undefined) { updates.push(`cnpj = $${idx++}`); params.push(cnpj); }
    if (telefone !== undefined) { updates.push(`telefone = $${idx++}`); params.push(telefone); }
    if (email !== undefined) { updates.push(`email = $${idx++}`); params.push(email); }
    if (contato_id !== undefined) { updates.push(`contato_id = $${idx++}`); params.push(contato_id); }

    if (updates.length === 0) return res.status(400).json({ erro: 'Nenhum campo para atualizar' });
    updates.push('atualizado_em = now()');

    const row = await db.oneOrNone(
      `UPDATE cidadaos SET ${updates.join(', ')} WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      params
    );
    if (!row) return res.status(404).json({ erro: 'Cidadão não encontrado' });

    // Também atualiza o contato vinculado se houver
    if (contato_id && (nome || telefone)) {
      const cupdates = [];
      const cparams = [contato_id, req.operador.tenantId];
      let cidx = 3;
      if (nome) { cupdates.push(`nome = $${cidx++}`); cparams.push(nome); }
      if (telefone) { cupdates.push(`telefone = $${cidx++}`); cparams.push(telefone); }
      if (cupdates.length > 0) {
        await db.none(
          `UPDATE contatos SET ${cupdates.join(', ')} WHERE id = $1 AND tenant_id = $2`,
          cparams
        );
      }
    }

    res.json(row);
  } catch (err) {
    console.error('[admin/citizens-update]', err);
    res.status(500).json({ erro: err.message });
  }
});

// ─── Operadores (para seleção em formulários) ─────────────────
router.get('/operators', requirePermission(PERMISSIONS.PROTOCOLOS_VIEW), async (req, res) => {
  try {
    const { departamento_id } = req.query;
    let rows;
    if (departamento_id) {
      rows = await db.manyOrNone(
        `SELECT o.id, o.nome, o.email, o.papel
         FROM operadores o
         INNER JOIN operador_departamentos od ON od.operador_id = o.id AND od.departamento_id = $2
         WHERE o.tenant_id = $1 AND o.ativo IS NOT FALSE
         ORDER BY o.nome`,
        [req.operador.tenantId, departamento_id]
      );
    } else {
      rows = await db.manyOrNone(
        `SELECT o.id, o.nome, o.email, o.papel
         FROM operadores o
         WHERE o.tenant_id = $1 AND o.ativo IS NOT FALSE
         ORDER BY o.nome`,
        [req.operador.tenantId]
      );
    }
    res.json(rows);
  } catch (err) {
    console.error('[admin/operators]', err);
    res.status(500).json({ erro: 'Erro ao listar operadores' });
  }
});

// ─── Configurações do tenant ────────────────────────────────
router.get('/config', requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req, res) => {
  const cfg = await db.oneOrNone(
    'SELECT * FROM tenant_protocolo_config WHERE tenant_id = $1',
    [req.operador.tenantId]
  );
  res.json(cfg || {});
});

router.put('/config', requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req, res) => {
  const { retencao_protocolo_dias, retencao_documento_dias, politica_privacidade,
          termos_uso, dados_encarregado, portal_titulo, primary_color } = req.body;
  const row = await db.one(
    `INSERT INTO tenant_protocolo_config (tenant_id, retencao_protocolo_dias, retencao_documento_dias,
      politica_privacidade, termos_uso, dados_encarregado, portal_titulo, primary_color, atualizado_em)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())
     ON CONFLICT (tenant_id) DO UPDATE SET
       retencao_protocolo_dias = COALESCE($2, tenant_protocolo_config.retencao_protocolo_dias),
       retencao_documento_dias = COALESCE($3, tenant_protocolo_config.retencao_documento_dias),
       politica_privacidade = COALESCE($4, tenant_protocolo_config.politica_privacidade),
       termos_uso = COALESCE($5, tenant_protocolo_config.termos_uso),
       dados_encarregado = COALESCE($6, tenant_protocolo_config.dados_encarregado),
       portal_titulo = COALESCE($7, tenant_protocolo_config.portal_titulo),
       primary_color = COALESCE($8, tenant_protocolo_config.primary_color),
       atualizado_em = now()
     RETURNING *`,
    [req.operador.tenantId, retencao_protocolo_dias, retencao_documento_dias,
     politica_privacidade, termos_uso, dados_encarregado, portal_titulo, primary_color]
  );
  res.json(row);
});

export default router;
