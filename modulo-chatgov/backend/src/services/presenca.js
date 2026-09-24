import db from '../db.js';

export async function atualizarPresenca(tenantId, operadorId, status, mensagem = null) {
  return db.none(
    `UPDATE operadores SET status_presenca = $1, status_mensagem = $2, ultimo_visto = now()
     WHERE id = $3 AND tenant_id = $4`,
    [status, mensagem, operadorId, tenantId]
  );
}

export async function getPresenca(tenantId, operadorId) {
  return db.oneOrNone(
    'SELECT status_presenca, status_mensagem, online, ultimo_visto FROM operadores WHERE id = $1 AND tenant_id = $2',
    [operadorId, tenantId]
  );
}

export async function getTodosOnline(tenantId) {
  return db.manyOrNone(
    `SELECT id, nome, online, status_presenca, status_mensagem, ultimo_visto
     FROM operadores WHERE tenant_id = $1 ORDER BY online DESC, nome`,
    [tenantId]
  );
}
