import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import db from '../db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function runMigrations() {
  const migrations = [
    join(__dirname, 'schema.sql'),
    join(__dirname, 'evolucoes.sql'),
  ];

  for (const path of migrations) {
    try {
      const sql = readFileSync(path, 'utf8');
      await db.none(sql);
      console.log(`[DB] Migration executed: ${path.split('/').pop()}`);
    } catch (err) {
      console.error(`[DB] Migration error (${path.split('/').pop()}):`, err.message);
      throw err;
    }
  }

  console.log('[DB] All migrations executed successfully');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations()
    .then(() => {
      console.log('Migrations complete.');
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
