import db from '../db.js';
import { v4 as uuidv4 } from 'uuid';

export async function editarMensagem(tenantId, msgId, operadorId, novoConteudo) {
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
    [novoConteudo, msgId, tenantId]
  );
}

export async function excluirMensagem(tenantId, msgId, operadorId) {
  return db.oneOrNone(
    `UPDATE mensagens_internas SET excluida = true, conteudo = 'Mensagem excluída'
     WHERE id = $1 AND tenant_id = $2 AND remetente_id = $3 RETURNING *`,
    [msgId, tenantId, operadorId]
  );
}

export async function encaminharMensagem(tenantId, msgId, canalDestinoId, operadorId) {
  const original = await db.oneOrNone(
    'SELECT * FROM mensagens_internas WHERE id = $1 AND tenant_id = $2',
    [msgId, tenantId]
  );
  if (!original) return null;
  const msgId2 = uuidv4();
  return db.one(
    `INSERT INTO mensagens_internas (id, tenant_id, canal_id, remetente_id, tipo, conteudo, media_url, encaminhada_de, criado_em)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now()) RETURNING *`,
    [msgId2, tenantId, canalDestinoId, operadorId, original.tipo, original.conteudo, original.media_url, original.canal_id]
  );
}

export async function fixarMensagem(tenantId, canalId, mensagemId, operadorId) {
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
            o.nome as fixada_por_nome, mi.remetente_id
     FROM mensagens_fixadas mf
     JOIN mensagens_internas mi ON mi.id = mf.mensagem_id
     LEFT JOIN operadores o ON o.id = mf.fixada_por
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

export async function getReacoes(tenantId, mensagemId) {
  return db.manyOrNone(
    `SELECT emoji, COUNT(*)::int as contagem,
            json_agg(json_build_object('operador_id', operador_id, 'nome', o.nome)) as usuarios
     FROM reacoes_mensagens rm
     LEFT JOIN operadores o ON o.id = rm.operador_id
     WHERE rm.mensagem_id = $1 AND rm.tenant_id = $2
     GROUP BY emoji`,
    [mensagemId, tenantId]
  );
}

export async function marcarLido(tenantId, canalId, operadorId) {
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
  const canais = await db.manyOrNone(
    `SELECT cm.canal_id FROM canal_membros cm
     JOIN canais_internos ci ON ci.id = cm.canal_id
     WHERE cm.operador_id = $1 AND ci.tenant_id = $2`,
    [operadorId, tenantId]
  );
  let total = 0;
  for (const c of canais) {
    const leitura = await db.oneOrNone(
      'SELECT lido_ate FROM leituras_mensagens WHERE operador_id = $1 AND canal_id = $2',
      [operadorId, c.canal_id]
    );
    const desde = leitura?.lido_ate || new Date(0);
    const r = await db.one(
      `SELECT COUNT(*)::int as c FROM mensagens_internas
       WHERE canal_id = $1 AND tenant_id = $2 AND remetente_id <> $3 AND criado_em > $4`,
      [c.canal_id, tenantId, operadorId, desde]
    );
    total += r.c;
  }
  return total;
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
