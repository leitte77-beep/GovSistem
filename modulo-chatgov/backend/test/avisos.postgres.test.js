import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import pgPromise from 'pg-promise';
import {
  atualizarAviso, criarAviso, definirAvisoAtivo, listarAvisosAdministracao,
  listarAvisosPendentes, listarDestinatariosAviso, registrarLeituraAviso,
} from '../src/services/avisos.js';

const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || '';
const databaseName = (() => {
  try { return new URL(databaseUrl).pathname.slice(1); } catch { return ''; }
})();
const bancoSeguro = /(?:^|_)(?:test|dev)(?:_|$)/i.test(databaseName);

let pgp;
let db;
let tenantId;
let adminId;
let atendenteId;
let outroAtendenteId;
let departamentoId;

before(async () => {
  if (!bancoSeguro) return;
  pgp = pgPromise();
  db = pgp(databaseUrl);
  const sufixo = `${process.pid}-${Date.now()}`;
  tenantId = (await db.one(
    'INSERT INTO tenants (nome, slug) VALUES ($1,$2) RETURNING id',
    ['Teste avisos', `teste-avisos-${sufixo}`],
  )).id;
  departamentoId = (await db.one(
    "INSERT INTO departamentos (tenant_id, nome) VALUES ($1,'Informática') RETURNING id",
    [tenantId],
  )).id;
  const criarOperador = async (nome, papel) => (await db.one(
    `INSERT INTO operadores (tenant_id, nome, email, senha_hash, papel, ativo)
     VALUES ($1,$2,$3,'teste',$4,true) RETURNING id`,
    [tenantId, nome, `${nome.toLowerCase()}-${sufixo}@teste.local`, papel],
  )).id;
  adminId = await criarOperador('Administrador', 'admin');
  atendenteId = await criarOperador('Atendente TI', 'operador');
  outroAtendenteId = await criarOperador('Atendente Obras', 'operador');
  await db.none(
    `INSERT INTO operador_departamentos (operador_id, departamento_id, tenant_id)
     VALUES ($1,$2,$3)`,
    [atendenteId, departamentoId, tenantId],
  );
});

after(async () => {
  if (db && tenantId) await db.none('DELETE FROM tenants WHERE id = $1', [tenantId]);
  if (pgp) pgp.end();
});

test('PostgreSQL entrega por setor, exige confirmação e consolida leituras', { skip: !bancoSeguro }, async () => {
  const aviso = await criarAviso(db, {
    tenantId, autorId: adminId,
    dados: {
      titulo: 'Nova funcionalidade', mensagem: 'Confira o novo módulo.',
      prioridade: 'importante', publico: 'setores',
      departamento_ids: [departamentoId], exige_confirmacao: true,
    },
  });

  assert.equal((await listarAvisosPendentes(db, {
    tenantId, operadorId: atendenteId, papel: 'operador',
  })).length, 1);
  assert.equal((await listarAvisosPendentes(db, {
    tenantId, operadorId: outroAtendenteId, papel: 'operador',
  })).length, 0);
  assert.deepEqual(await listarAvisosPendentes(db, {
    tenantId, operadorId: adminId, papel: 'admin',
  }), []);
  assert.equal(await registrarLeituraAviso(db, {
    tenantId, operadorId: outroAtendenteId, avisoId: aviso.id, confirmado: true,
  }), null, 'quem não pertence ao setor não pode forjar leitura');

  await registrarLeituraAviso(db, {
    tenantId, operadorId: atendenteId, avisoId: aviso.id, confirmado: false,
  });
  assert.equal((await listarAvisosPendentes(db, {
    tenantId, operadorId: atendenteId, papel: 'operador',
  })).length, 1, 'fechar não elimina aviso que exige confirmação');

  await registrarLeituraAviso(db, {
    tenantId, operadorId: atendenteId, avisoId: aviso.id, confirmado: true,
  });
  assert.equal((await listarAvisosPendentes(db, {
    tenantId, operadorId: atendenteId, papel: 'operador',
  })).length, 0);

  const [resumo] = await listarAvisosAdministracao(db, tenantId);
  assert.equal(resumo.total_destinatarios, 1);
  assert.equal(resumo.total_lidos, 1);
  assert.equal(resumo.total_confirmados, 1);
  const [destinatario] = await listarDestinatariosAviso(db, { tenantId, avisoId: aviso.id });
  assert.equal(destinatario.id, atendenteId);
  assert.ok(destinatario.confirmado_em);

  await atualizarAviso(db, {
    tenantId, avisoId: aviso.id,
    dados: {
      titulo: 'Nova funcionalidade atualizada', mensagem: 'Confira os detalhes novos.',
      prioridade: 'urgente', publico: 'todos', departamento_ids: [], exige_confirmacao: true,
    },
  });
  assert.equal((await listarAvisosPendentes(db, {
    tenantId, operadorId: atendenteId, papel: 'operador',
  })).length, 1, 'editar zera a confirmação anterior');
  assert.equal((await listarAvisosPendentes(db, {
    tenantId, operadorId: outroAtendenteId, papel: 'operador',
  })).length, 1, 'edição para todos inclui o outro atendente');

  await definirAvisoAtivo(db, { tenantId, avisoId: aviso.id, ativo: false });
  assert.equal((await listarAvisosPendentes(db, {
    tenantId, operadorId: atendenteId, papel: 'operador',
  })).length, 0);
  const republicado = await definirAvisoAtivo(db, {
    tenantId, avisoId: aviso.id, ativo: true, republicar: true,
  });
  assert.equal(republicado.ativo, true);
});
