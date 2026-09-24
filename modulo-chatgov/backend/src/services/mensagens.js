import db from '../db.js';
import { v4 as uuidv4 } from 'uuid';

const MAX_CONTEUDO = 8000;

function validarConteudo(conteudo) {
  if (conteudo == null) return null;
  const txt = String(conteudo).trim();
  if (txt.length > MAX_CONTEUDO) {
    const err = new Error(`Mensagem excede o limite de ${MAX_CONTEUDO} caracteres`);
    err.code = 'CONTENT_TOO_LONG';
    throw err;
  }
  return txt.length === 0 ? null : txt;
}

export async function ehMembroCanal(tenantId, canalId, operadorId) {
  const r = await db.oneOrNone(
    `SELECT 1 FROM canal_membros cm
     JOIN canais_internos ci ON ci.id = cm.canal_id
     WHERE cm.canal_id = $1 AND cm.operador_id = $2 AND ci.tenant_id = $3`,
    [canalId, operadorId, tenantId]
  );
  return !!r;
}

export async function assertMembroCanal(tenantId, canalId, operadorId) {
  const ok = await ehMembroCanal(tenantId, canalId, operadorId);
  if (!ok) {
    const err = new Error('Sem permissao neste canal');
    err.code = 'NOT_A_MEMBER';
    throw err;
  }
}

export async function listarMembrosCanal(tenantId, canalId) {
  return db.manyOrNone(
    `SELECT o.id, o.nome, o.online
     FROM canal_membros cm
     JOIN operadores o ON o.id = cm.operador_id
     WHERE cm.canal_id = $1 AND o.tenant_id = $2
     ORDER BY o.nome ASC`,
    [canalId, tenantId]
  );
}

export async function editarMensagem(tenantId, msgId, operadorId, novoConteudo) {
  const conteudo = validarConteudo(novoConteudo);
  if (!conteudo) {
    const err = new Error('Conteudo vazio');
    err.code = 'EMPTY_CONTENT';
    throw err;
  }
  const msg = await db.oneOrNone(
    'SELECT * FROM mensagens_internas WHERE id = $1 AND tenant_id = $2 AND remetente_id = $3',
    [msgId, tenantId, operadorId]
  );
  if (!msg) return null;
  const horasDesde = (Date.now() - new Date(msg.criado_em).getTime()) / 3600000;
  if (horasDesde > 24) return null;
  return db.one(
    `UPDATE mensagens_internas SET conteudo = $1, editada = true, editada_em = now()
     WHERE id = $2 AND tenant_id = $3 RETURNING *`,
    [conteudo, msgId, tenantId]
  );
}

export async function excluirMensagem(tenantId, msgId, operadorId) {
  return db.oneOrNone(
    `UPDATE mensagens_internas SET excluida = true, conteudo = 'Mensagem excluida'
     WHERE id = $1 AND tenant_id = $2 AND remetente_id = $3 RETURNING *`,
    [msgId, tenantId, operadorId]
  );
}

export async function encaminharMensagem(tenantId, msgId, canalDestinoId, operadorId) {
  await assertMembroCanal(tenantId, canalDestinoId, operadorId);
  const original = await db.oneOrNone(
    'SELECT * FROM mensagens_internas WHERE id = $1 AND tenant_id = $2',
    [msgId, tenantId]
  );
  if (!original) return null;
  const ehMembroOrigem = await ehMembroCanal(tenantId, original.canal_id, operadorId);
  if (!ehMembroOrigem) return null;
  const novoId = uuidv4();
  return db.one(
    `INSERT INTO mensagens_internas (id, tenant_id, canal_id, remetente_id, tipo, conteudo, media_url, media_mime, encaminhada_de, criado_em)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now()) RETURNING *`,
    [novoId, tenantId, canalDestinoId, operadorId, original.tipo, original.conteudo, original.media_url, original.media_mime, original.id]
  );
}

export async function fixarMensagem(tenantId, canalId, mensagemId, operadorId) {
  await assertMembroCanal(tenantId, canalId, operadorId);
  const count = await db.one(
    'SELECT COUNT(*)::int as c FROM mensagens_fixadas WHERE canal_id = $1 AND tenant_id = $2',
    [canalId, tenantId]
  );
  if (count.c >= 3) {
    await db.none(
      'DELETE FROM mensagens_fixadas WHERE ctid IN (SELECT ctid FROM mensagens_fixadas WHERE canal_id = $1 AND tenant_id = $2 ORDER BY fixada_em ASC LIMIT 1)',
      [canalId, tenantId]
    );
  }
  return db.one(
    `INSERT INTO mensagens_fixadas (tenant_id, canal_id, mensagem_id, fixada_por)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (canal_id, mensagem_id) DO NOTHING RETURNING *`,
    [tenantId, canalId, mensagemId, operadorId]
  );
}

export async function desafixarMensagem(tenantId, canalId, mensagemId) {
  return db.none(
    'DELETE FROM mensagens_fixadas WHERE canal_id = $1 AND mensagem_id = $2 AND tenant_id = $3',
    [canalId, mensagemId, tenantId]
  );
}

export async function getMensagensFixadas(tenantId, canalId) {
  return db.manyOrNone(
    `SELECT mf.*, mi.conteudo, mi.tipo, mi.media_url, mi.criado_em as msg_criado_em,
            o.nome as fixada_por_nome, mi.remetente_id,
            autor.nome as remetente_nome
     FROM mensagens_fixadas mf
     JOIN mensagens_internas mi ON mi.id = mf.mensagem_id
     LEFT JOIN operadores o ON o.id = mf.fixada_por
     LEFT JOIN operadores autor ON autor.id = mi.remetente_id
     WHERE mf.canal_id = $1 AND mf.tenant_id = $2
     ORDER BY mf.fixada_em ASC`,
    [canalId, tenantId]
  );
}

export async function adicionarReacao(tenantId, mensagemId, operadorId, emoji) {
  return db.one(
    `INSERT INTO reacoes_mensagens (tenant_id, mensagem_id, operador_id, emoji)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (mensagem_id, operador_id, emoji) DO NOTHING RETURNING *`,
    [tenantId, mensagemId, operadorId, emoji]
  );
}

export async function removerReacao(tenantId, mensagemId, operadorId, emoji) {
  return db.none(
    'DELETE FROM reacoes_mensagens WHERE mensagem_id = $1 AND operador_id = $2 AND emoji = $3 AND tenant_id = $4',
    [mensagemId, operadorId, emoji, tenantId]
  );
}

export async function getReacoes(tenantId, mensagemIds) {
  if (!Array.isArray(mensagemIds) || mensagemIds.length === 0) return [];
  return db.manyOrNone(
    `SELECT rm.mensagem_id as msg_id, rm.emoji, COUNT(*)::int as contagem,
            json_agg(json_build_object('operador_id', rm.operador_id, 'nome', o.nome) ORDER BY o.nome) as usuarios
     FROM reacoes_mensagens rm
     LEFT JOIN operadores o ON o.id = rm.operador_id
     WHERE rm.mensagem_id = ANY($1::uuid[]) AND rm.tenant_id = $2
     GROUP BY rm.mensagem_id, rm.emoji
     ORDER BY rm.mensagem_id`,
    [mensagemIds, tenantId]
  );
}

export async function marcarLido(tenantId, canalId, operadorId) {
  await assertMembroCanal(tenantId, canalId, operadorId);
  await db.none(
    `INSERT INTO leituras_mensagens (operador_id, canal_id, lido_ate)
     VALUES ($1, $2, now())
     ON CONFLICT (operador_id, canal_id) DO UPDATE SET lido_ate = now()`,
    [operadorId, canalId]
  );
  return db.none(
    'UPDATE mensagens_internas SET lida = true WHERE canal_id = $1 AND tenant_id = $2 AND remetente_id <> $3 AND lida = false',
    [canalId, tenantId, operadorId]
  );
}

export async function contarNaoLidas(tenantId, operadorId) {
  const r = await db.one(
    `SELECT COUNT(*)::int as c
     FROM mensagens_internas mi
     JOIN canal_membros cm ON cm.canal_id = mi.canal_id AND cm.operador_id = $1
     LEFT JOIN leituras_mensagens lm
       ON lm.operador_id = cm.operador_id AND lm.canal_id = cm.canal_id
     WHERE mi.tenant_id = $2
       AND mi.remetente_id <> $1
       AND mi.excluida = false
       AND mi.criado_em > COALESCE(lm.lido_ate, '1970-01-01'::timestamp)`,
    [operadorId, tenantId]
  );
  return r.c;
}

export async function contarNaoLidasPorCanal(tenantId, operadorId, canalId) {
  const r = await db.one(
    `SELECT COUNT(*)::int as c
     FROM mensagens_internas mi
     JOIN canal_membros cm ON cm.canal_id = mi.canal_id AND cm.operador_id = $1
     LEFT JOIN leituras_mensagens lm
       ON lm.operador_id = cm.operador_id AND lm.canal_id = cm.canal_id
     WHERE mi.tenant_id = $2
       AND mi.canal_id = $3
       AND mi.remetente_id <> $1
       AND mi.excluida = false
       AND mi.criado_em > COALESCE(lm.lido_ate, '1970-01-01'::timestamp)`,
    [operadorId, tenantId, canalId]
  );
  return r.c;
}

export async function buscarMensagens(tenantId, operadorId, termo, filtros = {}) {
  let query = `SELECT mi.*, o.nome as remetente_nome, ci.nome as canal_nome
     FROM mensagens_internas mi
     JOIN operadores o ON o.id = mi.remetente_id
     JOIN canais_internos ci ON ci.id = mi.canal_id
     JOIN canal_membros cm ON cm.canal_id = ci.id AND cm.operador_id = $2
     WHERE mi.tenant_id = $1 AND mi.excluida = false`;
  const params = [tenantId, operadorId];

  if (termo) {
    params.push(`%${termo}%`);
    query += ` AND (mi.conteudo ILIKE $${params.length})`;
  }
  if (filtros.tipo) {
    params.push(filtros.tipo);
    query += ` AND mi.tipo = $${params.length}`;
  }
  if (filtros.canal_id) {
    params.push(filtros.canal_id);
    query += ` AND mi.canal_id = $${params.length}`;
  }
  if (filtros.remetente_id) {
    params.push(filtros.remetente_id);
    query += ` AND mi.remetente_id = $${params.length}`;
  }

  query += ' ORDER BY mi.criado_em DESC LIMIT 50';
  return db.manyOrNone(query, params);
}

export async function listarMensagensCanal(tenantId, canalId, operadorId, { antesDe, limite = 50 } = {}) {
  await assertMembroCanal(tenantId, canalId, operadorId);
  const lim = Math.min(Math.max(parseInt(limite, 10) || 50, 1), 200);
  const params = [canalId, tenantId];
  let query = `SELECT mi.*, o.nome as remetente_nome
     FROM mensagens_internas mi
     JOIN operadores o ON o.id = mi.remetente_id
     WHERE mi.canal_id = $1 AND mi.tenant_id = $2`;
  if (antesDe) {
    params.push(antesDe);
    query += ` AND mi.criado_em < $${params.length}`;
  }
  params.push(lim);
  query += ` ORDER BY mi.criado_em DESC LIMIT $${params.length}`;
  const rows = await db.manyOrNone(query, params);
  return rows.reverse();
}
