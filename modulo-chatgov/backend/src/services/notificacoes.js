import db from '../db.js';

export async function criarNotificacao(tenantId, operadorId, tipo, titulo, mensagem, link) {
  return db.one(
    `INSERT INTO notificacoes (tenant_id, operador_id, tipo, titulo, mensagem, link)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [tenantId, operadorId, tipo, titulo, mensagem || null, link || null]
  );
}

export async function criarNotificacaoMultipla(tenantId, operadorIds, tipo, titulo, mensagem, link) {
  for (const opId of operadorIds) {
    await criarNotificacao(tenantId, opId, tipo, titulo, mensagem, link).catch(() => {});
  }
}

export async function listarNotificacoes(tenantId, operadorId, filtros = {}) {
  const params = [tenantId, operadorId];
  let query = `SELECT * FROM notificacoes
               WHERE tenant_id = $1 AND operador_id = $2`;
  if (filtros.apenasNaoLidas) query += ' AND lida = false';
  if (filtros.arquivadas) query += ' AND arquivada_em IS NOT NULL';
  else query += ' AND arquivada_em IS NULL';
  if (filtros.busca) {
    params.push(`%${filtros.busca}%`);
    query += ` AND (titulo ILIKE $${params.length} OR COALESCE(mensagem, '') ILIKE $${params.length})`;
  }
  if (filtros.tipo) {
    params.push(filtros.tipo);
    query += ` AND tipo = $${params.length}`;
  }
  const limite = Math.min(Math.max(Number(filtros.limite) || 50, 1), 100);
  const pagina = Math.max(Number(filtros.pagina) || 1, 1);
  params.push(limite, (pagina - 1) * limite);
  query += ` ORDER BY criado_em DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;
  return db.manyOrNone(query, params);
}

export async function contarNaoLidasNotificacoes(tenantId, operadorId) {
  const r = await db.one(
    `SELECT COUNT(*)::int as c FROM notificacoes
     WHERE tenant_id = $1 AND operador_id = $2 AND lida = false AND arquivada_em IS NULL`,
    [tenantId, operadorId]
  );
  return r.c;
}

export async function marcarNotificacaoLida(tenantId, operadorId, notificacaoId) {
  return db.none(
    'UPDATE notificacoes SET lida = true WHERE id = $1 AND tenant_id = $2 AND operador_id = $3',
    [notificacaoId, tenantId, operadorId]
  );
}

export async function marcarTodasLidas(tenantId, operadorId) {
  return db.none(
    'UPDATE notificacoes SET lida = true WHERE tenant_id = $1 AND operador_id = $2',
    [tenantId, operadorId]
  );
}

export async function arquivarNotificacao(tenantId, operadorId, notificacaoId) {
  return db.oneOrNone(
    `UPDATE notificacoes SET arquivada_em = now()
     WHERE id = $1 AND tenant_id = $2 AND operador_id = $3 AND arquivada_em IS NULL
     RETURNING *`,
    [notificacaoId, tenantId, operadorId]
  );
}

export async function getConfigNotificacoes(tenantId, operadorId) {
  const cfg = await db.oneOrNone(
    'SELECT * FROM config_notificacoes WHERE operador_id = $1',
    [operadorId]
  );
  if (!cfg) {
    return await db.one(
      `INSERT INTO config_notificacoes (operador_id) VALUES ($1)
       ON CONFLICT DO NOTHING RETURNING *`,
      [operadorId]
    );
  }
  return cfg;
}

export async function atualizarConfigNotificacoes(tenantId, operadorId, dados) {
  return db.oneOrNone(
    `UPDATE config_notificacoes SET
       push_ativo = COALESCE($1, push_ativo),
       som_ativado = COALESCE($2, som_ativado),
       nao_perturbe_inicio = $3,
       nao_perturbe_fim = $4,
       resumo_email = COALESCE($5, resumo_email),
       atualizado_em = now()
     WHERE operador_id = $6 RETURNING *`,
    [dados.push_ativo ?? null, dados.som_ativado ?? null,
     dados.nao_perturbe_inicio || null, dados.nao_perturbe_fim || null,
     dados.resumo_email || null, operadorId]
  );
}

export async function silenciarConversa(tenantId, operadorId, conversaId, canalId, silenciar) {
  return db.one(
    `INSERT INTO conversas_silenciadas (operador_id, conversa_id, canal_id, silenciar)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (operador_id, conversa_id, canal_id) DO UPDATE SET silenciar = $4 RETURNING *`,
    [operadorId, conversaId || null, canalId || null, silenciar || 'tudo']
  );
}

export async function getSilenciadas(tenantId, operadorId) {
  return db.manyOrNone(
    'SELECT * FROM conversas_silenciadas WHERE operador_id = $1',
    [operadorId]
  );
}

export async function getContagemNaoLidasPorCanal(tenantId, operadorId) {
  return db.manyOrNone(
    `SELECT cm.canal_id,
            COALESCE(
              (SELECT COUNT(*)::int FROM mensagens_internas mi
               WHERE mi.canal_id = cm.canal_id AND mi.tenant_id = $2 AND mi.remetente_id <> $1
                 AND mi.criado_em > COALESCE(
                   (SELECT lido_ate FROM leituras_mensagens lm WHERE lm.operador_id = $1 AND lm.canal_id = cm.canal_id),
                   '1970-01-01'::timestamptz
                 )),
              0
            ) as nao_lidas
     FROM canal_membros cm
     WHERE cm.operador_id = $1`,
    [operadorId, tenantId]
  );
}
