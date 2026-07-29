import pgPromise from 'pg-promise';
import { config } from './config.js';

const pgp = pgPromise({
  capSQL: true,
  receive(data, result, e) {
    if (e && e.code) {
      console.error('DB Error:', e.message);
    }
  },
});

const connection = {
  connectionString: config.databaseUrl,
  max: 30,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
};

const db = pgp(connection);

// Erro emitido pelo pool fora do escopo de uma query (ex.: "Connection terminated
// due to connection timeout") sobe como uncaughtException e derruba o processo —
// foram 37 restarts em uma noite, cada um levando junto as sessões do WhatsApp.
// Aqui ele vira log: o pool se recupera sozinho na próxima query.
db.$pool.on('error', (err) => {
  console.error('[DB] Pool error (ignorado, pool se recupera):', err.message);
});

export async function setTenantContext(tenantId) {
  if (tenantId) {
    await db.none('SET app.tenant_id = $1', [tenantId]);
  }
}

export async function tenantedQuery(tenantId, query, values = []) {
  await setTenantContext(tenantId);
  return db.query(query, values);
}

export { pgp };
export default db;
