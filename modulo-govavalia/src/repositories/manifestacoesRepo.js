'use strict';
const { pool } = require('../db');
const { gerarProtocolo } = require('../services/protocolo');
const config = require('../config');

/**
 * Cria uma manifestação. Gera protocolo único (com retry em caso de colisão).
 * Se houver contato (cidadão identificado), define o prazo de retenção.
 */
async function criarManifestacao({ tipo, mensagem, anonimo, contato, unidadeId }) {
  const contatoFinal = anonimo ? null : (contato || null);
  const expira = contatoFinal
    ? new Date(Date.now() + config.retencaoContatoDias * 86400000)
    : null;

  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const protocolo = gerarProtocolo();
    try {
      const { rows } = await pool.query(
        `INSERT INTO govavalia.manifestacao
           (protocolo, tipo, mensagem, anonimo, contato, contato_expira_em, unidade_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING id, protocolo, criado_em`,
        [protocolo, tipo, mensagem, !!anonimo, contatoFinal, expira, unidadeId || null]
      );
      await pool.query(
        `INSERT INTO govavalia.manifestacao_evento (manifestacao_id, status, observacao, ator)
         VALUES ($1,'recebida','Manifestação registrada','publico')`,
        [rows[0].id]
      );
      return rows[0];
    } catch (e) {
      if (e.code === '23505') continue; // protocolo duplicado: tenta de novo
      throw e;
    }
  }
  throw new Error('Não foi possível gerar um protocolo único.');
}

/** Consulta pública por protocolo: devolve só o andamento, sem dado pessoal. */
async function statusPublico(protocolo) {
  const { rows } = await pool.query(
    `SELECT protocolo, tipo, status, resposta, criado_em, atualizado_em
       FROM govavalia.manifestacao WHERE protocolo = $1`,
    [protocolo]
  );
  return rows[0] || null;
}

/** Listagem para o painel (com filtros e paginação). Contém dado pessoal. */
async function listar({ tipo, status, unidadeId, de, ate, limite = 50, pagina = 1 }) {
  const cond = [];
  const params = [];
  if (tipo)      { params.push(tipo);      cond.push(`tipo = $${params.length}`); }
  if (status)    { params.push(status);    cond.push(`status = $${params.length}`); }
  if (unidadeId) { params.push(unidadeId); cond.push(`unidade_id = $${params.length}`); }
  if (de)        { params.push(de);        cond.push(`criado_em >= $${params.length}`); }
  if (ate)       { params.push(ate);       cond.push(`criado_em <= $${params.length}`); }
  const where = cond.length ? 'WHERE ' + cond.join(' AND ') : '';

  const lim = Math.min(parseInt(limite, 10) || 50, 200);
  const off = (Math.max(parseInt(pagina, 10) || 1, 1) - 1) * lim;
  params.push(lim); params.push(off);

  const { rows } = await pool.query(
    `SELECT id, protocolo, tipo, mensagem, anonimo, contato, status, resposta,
            criado_em, atualizado_em
       FROM govavalia.manifestacao
       ${where}
      ORDER BY criado_em DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  const { rows: c } = await pool.query(
    `SELECT count(*) AS total FROM govavalia.manifestacao ${where}`,
    params.slice(0, params.length - 2)
  );
  return { itens: rows, total: parseInt(c[0].total, 10), pagina: Math.max(parseInt(pagina, 10) || 1, 1), limite: lim };
}

async function buscarPorId(id) {
  const { rows } = await pool.query(
    `SELECT * FROM govavalia.manifestacao WHERE id = $1`, [id]);
  return rows[0] || null;
}

async function atualizar(id, { status, resposta, ator }) {
  const { rows } = await pool.query(
    `UPDATE govavalia.manifestacao
        SET status = COALESCE($2, status),
            resposta = COALESCE($3, resposta),
            atualizado_em = now()
      WHERE id = $1
      RETURNING id, protocolo, status`,
    [id, status ?? null, resposta ?? null]
  );
  if (rows[0] && status) {
    await pool.query(
      `INSERT INTO govavalia.manifestacao_evento (manifestacao_id, status, ator)
       VALUES ($1,$2,$3)`,
      [id, status, ator || 'sistema']
    );
  }
  return rows[0] || null;
}

async function paraCsv({ tipo, status, unidadeId, de, ate } = {}) {
  const cond = [];
  const params = [];
  if (tipo)      { params.push(tipo);      cond.push(`tipo = $${params.length}`); }
  if (status)    { params.push(status);    cond.push(`status = $${params.length}`); }
  if (unidadeId) { params.push(unidadeId); cond.push(`unidade_id = $${params.length}`); }
  if (de)        { params.push(de);        cond.push(`criado_em >= $${params.length}`); }
  if (ate)       { params.push(ate);       cond.push(`criado_em <= $${params.length}`); }
  const where = cond.length ? 'WHERE ' + cond.join(' AND ') : '';
  const { rows } = await pool.query(
    `SELECT criado_em, protocolo, tipo, status,
            CASE WHEN anonimo THEN 'sim' ELSE 'nao' END AS anonimo,
            coalesce(contato,'') AS contato, mensagem, coalesce(resposta,'') AS resposta
       FROM govavalia.manifestacao ${where}
      ORDER BY criado_em DESC`,
    params
  );
  return rows;
}

module.exports = {
  criarManifestacao, statusPublico, listar, buscarPorId, atualizar, paraCsv
};
