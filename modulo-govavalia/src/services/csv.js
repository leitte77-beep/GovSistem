'use strict';
/** Monta um CSV (separador ';', com BOM para o Excel em português). */
function montarCsv(cabecalho, linhas) {
  const esc = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const corpo = [cabecalho, ...linhas]
    .map(l => l.map(esc).join(';'))
    .join('\r\n');
  return '\ufeff' + corpo;
}
module.exports = { montarCsv };
