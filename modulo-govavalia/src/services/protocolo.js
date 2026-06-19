'use strict';
const crypto = require('crypto');

/** Gera um protocolo legível: OUV-2026-483920 */
function gerarProtocolo() {
  const ano = new Date().getFullYear();
  const n = 100000 + crypto.randomInt(900000);
  return `OUV-${ano}-${n}`;
}

module.exports = { gerarProtocolo };
