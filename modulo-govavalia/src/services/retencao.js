'use strict';
const { pool } = require('../db');
const { auditar } = require('../audit');

/**
 * Apaga o contato (dado pessoal) das manifestações cujo prazo de retenção
 * expirou. A manifestação permanece (estatística/histórico), mas deixa de
 * ser identificável. Atende o princípio de retenção da LGPD.
 *
 * Agende para rodar 1x ao dia (cron do sistema, agendador, ou setInterval).
 */
async function anonimizarContatosExpirados() {
  const { rowCount } = await pool.query(
    `UPDATE govavalia.manifestacao
        SET contato = NULL, contato_expira_em = NULL, atualizado_em = now()
      WHERE contato IS NOT NULL
        AND contato_expira_em IS NOT NULL
        AND contato_expira_em < now()`
  );
  if (rowCount > 0) {
    await auditar({
      ator: 'sistema',
      acao: 'retencao.anonimizar_contato',
      detalhe: { quantidade: rowCount }
    });
  }
  return rowCount;
}

module.exports = { anonimizarContatosExpirados };
