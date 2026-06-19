'use strict';
const { pool } = require('../db');

async function listarPerguntasAtivas() {
  const { rows } = await pool.query(
    `SELECT codigo, texto FROM govavalia.pergunta
      WHERE ativo = true ORDER BY ordem, criado_em`
  );
  return rows;
}

async function listarPerguntasTodas() {
  const { rows } = await pool.query(
    `SELECT id, codigo, texto, ordem, ativo FROM govavalia.pergunta
      ORDER BY ordem, criado_em`
  );
  return rows;
}

async function criarPergunta({ codigo, texto, ordem }) {
  const { rows } = await pool.query(
    `INSERT INTO govavalia.pergunta (codigo, texto, ordem)
     VALUES ($1,$2,$3) RETURNING id, codigo, texto, ordem, ativo`,
    [codigo, texto, ordem || 0]
  );
  return rows[0];
}

async function atualizarPergunta(id, { texto, ordem, ativo }) {
  const { rows } = await pool.query(
    `UPDATE govavalia.pergunta
        SET texto = COALESCE($2, texto),
            ordem = COALESCE($3, ordem),
            ativo = COALESCE($4, ativo)
      WHERE id = $1
      RETURNING id, codigo, texto, ordem, ativo`,
    [id, texto ?? null, ordem ?? null, ativo ?? null]
  );
  return rows[0] || null;
}

async function listarUnidadesAtivas() {
  const { rows } = await pool.query(
    `SELECT id, nome FROM govavalia.unidade WHERE ativo = true ORDER BY nome`
  );
  return rows;
}

module.exports = {
  listarPerguntasAtivas, listarPerguntasTodas, criarPergunta,
  atualizarPergunta, listarUnidadesAtivas
};
