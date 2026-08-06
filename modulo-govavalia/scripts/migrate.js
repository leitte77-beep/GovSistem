'use strict';
/**
 * Roda as migrations de db/migrations em ordem, uma única vez cada.
 * Uso:  DATABASE_URL=postgres://... node scripts/migrate.js
 */
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/db');

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS govavalia_migrations (
      nome text PRIMARY KEY,
      aplicada_em timestamptz NOT NULL DEFAULT now()
    )`);

  const dir = path.join(__dirname, '..', 'db', 'migrations');
  const arquivos = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();

  for (const arq of arquivos) {
    const { rowCount } = await pool.query(
      'SELECT 1 FROM govavalia_migrations WHERE nome = $1', [arq]);
    if (rowCount) { console.log(`= ${arq} (já aplicada)`); continue; }

    const sql = fs.readFileSync(path.join(dir, arq), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO govavalia_migrations (nome) VALUES ($1)', [arq]);
      await client.query('COMMIT');
      console.log(`+ ${arq} aplicada`);
    } catch (e) {
      await client.query('ROLLBACK');
      console.error(`x ${arq} falhou:`, e.message);
      process.exit(1);
    } finally {
      client.release();
    }
  }
  await pool.end();
  console.log('Migrations concluídas.');
}

main().catch(e => { console.error(e); process.exit(1); });
