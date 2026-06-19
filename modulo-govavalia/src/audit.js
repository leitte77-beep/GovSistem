'use strict';
const { pool } = require('./db');

/**
 * Grava uma entrada na trilha de auditoria. Use para TODA leitura de dado
 * pessoal/sensível (ler manifestação), alteração de dado de cidadão, e
 * exportação. NUNCA passe o conteúdo da mensagem ou o contato em `detalhe`.
 *
 * @param {object} e
 * @param {string} e.ator     id do servidor autenticado, 'publico' ou 'sistema'
 * @param {string} e.acao     ex.: 'manifestacao.ler', 'export.csv'
 * @param {string} [e.recurso] ex.: 'manifestacao:<uuid>'
 * @param {string} [e.origem]  IP/host de origem
 * @param {object} [e.detalhe] metadados NÃO sensíveis (contagens, filtros, ids)
 */
async function auditar(e) {
  try {
    await pool.query(
      `INSERT INTO govavalia.auditoria (ator, acao, recurso, origem, detalhe)
       VALUES ($1,$2,$3,$4,$5)`,
      [e.ator || 'sistema', e.acao, e.recurso || null, e.origem || null,
       e.detalhe ? JSON.stringify(e.detalhe) : null]
    );
  } catch (err) {
    // Falha de auditoria é grave: registra no log de aplicação para alerta,
    // mas não interrompe a operação do cidadão.
    console.error('[govavalia] FALHA AO AUDITAR:', e.acao, err.message);
  }
}

/** Extrai a origem (IP) da requisição, respeitando proxy reverso. */
function origemDe(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || req.ip || req.socket?.remoteAddress || null;
}

module.exports = { auditar, origemDe };
