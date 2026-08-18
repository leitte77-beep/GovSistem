import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import pgPromise from 'pg-promise';
import { promoverFilaAtendente, solicitarAtendente } from '../src/services/filaAtendente.js';

const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || '';
const databaseName = (() => {
  try { return new URL(databaseUrl).pathname.slice(1); } catch { return ''; }
})();
const bancoSeguro = /(?:^|_)(?:test|dev)(?:_|$)/i.test(databaseName);

let db;
let pgp;
let tenantId;
let operadorId;
let conversaFilaId;

before(async () => {
  if (!bancoSeguro) return;
  pgp = pgPromise();
  db = pgp(databaseUrl);
  const sufixo = `${process.pid}-${Date.now()}`;
  const tenant = await db.one(
    'INSERT INTO tenants (nome, slug) VALUES ($1, $2) RETURNING id',
    ['Teste fila pessoal', `teste-fila-pessoal-${sufixo}`],
  );
  tenantId = tenant.id;
  const departamento = await db.one(
    "INSERT INTO departamentos (tenant_id, nome) VALUES ($1, 'Informática') RETURNING id",
    [tenantId],
  );
  const operador = await db.one(
    `INSERT INTO operadores (tenant_id, nome, email, senha_hash, papel, online, ultimo_visto)
     VALUES ($1, 'Alisson', $2, 'teste', 'operador', true, now()) RETURNING id`,
    [tenantId, `alisson-${sufixo}@teste.local`],
  );
  operadorId = operador.id;
  await db.none(
    `INSERT INTO operador_departamentos (operador_id, departamento_id, tenant_id)
     VALUES ($1, $2, $3)`,
    [operadorId, departamento.id, tenantId],
  );

  for (let indice = 0; indice < 6; indice += 1) {
    const contato = await db.one(
      `INSERT INTO contatos (tenant_id, wa_jid, nome)
       VALUES ($1, $2, $3) RETURNING id`,
      [tenantId, `${sufixo}-${indice}@s.whatsapp.net`, `Cidadão ${indice}`],
    );
    const conversa = await db.one(
      `INSERT INTO conversas
         (tenant_id, contato_id, departamento_id, operador_id, status, status_operacional)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [
        tenantId, contato.id, departamento.id,
        indice < 5 ? operadorId : null,
        indice < 5 ? 'aberta' : 'fila',
        indice < 5 ? 'EM_ATENDIMENTO' : 'NA_FILA',
      ],
    );
    if (indice === 5) conversaFilaId = conversa.id;
  }
});

after(async () => {
  if (db && tenantId) await db.none('DELETE FROM tenants WHERE id = $1', [tenantId]);
  if (pgp) pgp.end();
});

test('PostgreSQL enfileira o sexto e o promove quando uma vaga abre', { skip: !bancoSeguro }, async () => {
  const fila = await solicitarAtendente(db, {
    tenantId, conversaId: conversaFilaId, operadorId,
  });
  assert.equal(fila.tipo, 'fila');
  assert.equal(fila.posicao, 6);

  await db.none(
    `UPDATE conversas SET status = 'resolvida', status_operacional = 'RESOLVIDA'
     WHERE tenant_id = $1 AND operador_id = $2
       AND status_operacional = 'EM_ATENDIMENTO'
       AND id = (SELECT id FROM conversas WHERE tenant_id = $1 AND operador_id = $2
                 AND status_operacional = 'EM_ATENDIMENTO' ORDER BY criado_em LIMIT 1)`,
    [tenantId, operadorId],
  );
  const promocao = await promoverFilaAtendente(db, { tenantId, operadorId });
  assert.deepEqual(promocao.promovidas.map(({ conversaId }) => conversaId), [conversaFilaId]);

  const conversa = await db.one(
    'SELECT operador_id, status_operacional FROM conversas WHERE id = $1',
    [conversaFilaId],
  );
  assert.equal(conversa.operador_id, operadorId);
  assert.equal(conversa.status_operacional, 'EM_ATENDIMENTO');
});
