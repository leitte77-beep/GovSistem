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
  connectionTimeoutMillis: 5000,
};

const db = pgp(connection);

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
