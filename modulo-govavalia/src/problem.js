'use strict';
/**
 * Resposta de erro no padrão RFC 9457 (Problem Details), recomendado para
 * APIs de governo. Mensagens nunca vazam dado pessoal, stack trace ou
 * detalhe interno de banco/framework.
 */
function problem(res, { status = 500, title, detail, type, instance }) {
  res.status(status).type('application/problem+json').json({
    type: type || `https://govsistem.com.br/erros/${status}`,
    title: title || 'Erro',
    status,
    detail,
    instance
  });
}

module.exports = { problem };
