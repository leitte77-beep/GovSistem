'use strict';
const { pool } = require('../db');

/**
 * Cria uma avaliação (pesquisa) com suas respostas, em transação.
 * `respostas` = [{ codigo, texto, nota }]
 */
async function criarAvaliacao({ unidadeId, respostas }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO govavalia.avaliacao (unidade_id) VALUES ($1)
       RETURNING id, criado_em`,
      [unidadeId || null]
    );
    const avaliacao = rows[0];
    for (const r of respostas) {
      await client.query(
        `INSERT INTO govavalia.avaliacao_resposta
           (avaliacao_id, pergunta_codigo, pergunta_texto, nota)
         VALUES ($1,$2,$3,$4)`,
        [avaliacao.id, r.codigo, r.texto, r.nota]
      );
    }
    await client.query('COMMIT');
    return avaliacao;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Resumo agregado por pergunta (média e contagem por nota), com filtros
 * opcionais de período e unidade. Não há dado pessoal aqui.
 */
async function resumo({ de, ate, unidadeId } = {}) {
  const cond = [];
  const params = [];
  if (de)        { params.push(de);        cond.push(`a.criado_em >= $${params.length}`); }
  if (ate)       { params.push(ate);       cond.push(`a.criado_em <= $${params.length}`); }
  if (unidadeId) { params.push(unidadeId); cond.push(`a.unidade_id = $${params.length}`); }
  const where = cond.length ? 'WHERE ' + cond.join(' AND ') : '';

  const { rows } = await pool.query(
    `SELECT r.pergunta_codigo AS codigo,
            max(r.pergunta_texto) AS texto,
            count(*) AS total,
            round(avg(r.nota)::numeric, 2) AS media,
            count(*) FILTER (WHERE r.nota = 1) AS n1,
            count(*) FILTER (WHERE r.nota = 2) AS n2,
            count(*) FILTER (WHERE r.nota = 3) AS n3,
            count(*) FILTER (WHERE r.nota = 4) AS n4,
            count(*) FILTER (WHERE r.nota = 5) AS n5
       FROM govavalia.avaliacao_resposta r
       JOIN govavalia.avaliacao a ON a.id = r.avaliacao_id
       ${where}
      GROUP BY r.pergunta_codigo
      ORDER BY r.pergunta_codigo`,
    params
  );

  const { rows: tot } = await pool.query(
    `SELECT count(*) AS total FROM govavalia.avaliacao a ${where}`, params
  );

  return { totalAvaliacoes: parseInt(tot[0].total, 10), perguntas: rows };
}

/** Linhas para exportação CSV (uma por resposta). */
async function paraCsv({ de, ate, unidadeId } = {}) {
  const cond = [];
  const params = [];
  if (de)        { params.push(de);        cond.push(`a.criado_em >= $${params.length}`); }
  if (ate)       { params.push(ate);       cond.push(`a.criado_em <= $${params.length}`); }
  if (unidadeId) { params.push(unidadeId); cond.push(`a.unidade_id = $${params.length}`); }
  const where = cond.length ? 'WHERE ' + cond.join(' AND ') : '';
  const { rows } = await pool.query(
    `SELECT a.criado_em, u.nome AS unidade, r.pergunta_texto, r.nota
       FROM govavalia.avaliacao_resposta r
       JOIN govavalia.avaliacao a ON a.id = r.avaliacao_id
       LEFT JOIN govavalia.unidade u ON u.id = a.unidade_id
       ${where}
      ORDER BY a.criado_em DESC`,
    params
  );
  return rows;
}

module.exports = { criarAvaliacao, resumo, paraCsv };
