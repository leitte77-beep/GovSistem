import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import db from '../db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function runMigrations() {
  const migrations = [
    join(__dirname, 'schema.sql'),
    join(__dirname, 'evolucoes.sql'),
    join(__dirname, '019_operacao_v2.sql'),
    join(__dirname, '020_operacao_confiavel.sql'),
    join(__dirname, '021_operacao_municipal.sql'),
    join(__dirname, '022_conversa_excluida.sql'),
    join(__dirname, '023_agenda_pessoal.sql'),
    join(__dirname, '024_protocolo_digital.sql'),
    join(__dirname, '025_protocolo_correcoes.sql'),
    join(__dirname, '027_cidadao_reset_senha.sql'),
    join(__dirname, '028_sessao_conta_sem_protocolo.sql'),
    join(__dirname, '029_conversa_ciclos.sql'),
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
