import test from 'node:test';
import assert from 'node:assert/strict';
import { departamentoPadraoDoOperador } from '../src/services/departamentos.js';

const conn = (linhas) => ({
  manyOrNone: async () => linhas,
});

test('operador cadastrado em um único setor herda esse setor', async () => {
  const id = await departamentoPadraoDoOperador(conn([{ id: 'dep-saude' }]), {
    operadorId: 'op-1', tenantId: 't-1',
  });
  assert.equal(id, 'dep-saude');
});

test('operador em dois setores não tem setor adivinhado', async () => {
  const id = await departamentoPadraoDoOperador(conn([{ id: 'dep-a' }, { id: 'dep-b' }]), {
    operadorId: 'op-1', tenantId: 't-1',
  });
  assert.equal(id, null);
});

test('operador sem setor cadastrado continua sem setor', async () => {
  const id = await departamentoPadraoDoOperador(conn([]), { operadorId: 'op-1', tenantId: 't-1' });
  assert.equal(id, null);
});

test('sem operador ou tenant não consulta o banco', async () => {
  const explode = { manyOrNone: async () => { throw new Error('não deveria consultar'); } };
  assert.equal(await departamentoPadraoDoOperador(explode, { operadorId: null, tenantId: 't-1' }), null);
  assert.equal(await departamentoPadraoDoOperador(explode, { operadorId: 'op-1', tenantId: null }), null);
});
