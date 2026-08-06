'use strict';
const { Pool } = require('pg');
const config = require('./config');

/**
 * Pool único de conexões. Reaproveite o pool do seu sistema se preferir —
 * basta exportar o mesmo objeto Pool aqui.
 */
const pool = new Pool({
  connectionString: config.databaseUrl,
  // TLS recomendado em produção; ajuste conforme seu provedor de banco.
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined
});

pool.on('error', (err) => {
  // Erro de conexão ocioso — registra sem derrubar o processo.
  console.error('[govavalia] erro no pool do banco:', err.message);
});

module.exports = { pool };
