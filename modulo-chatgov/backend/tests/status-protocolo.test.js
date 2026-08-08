import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedTransitions, assertTransition } from '../src/domain/status.js';

test('protocolo concluído ou cancelado pode ser arquivado', () => {
  assert.ok(allowedTransitions('protocolo', 'CONCLUIDO').includes('ARQUIVADO'));
  assert.ok(allowedTransitions('protocolo', 'CANCELADO').includes('ARQUIVADO'));
});

test('protocolo arquivado pode ser reaberto somente com justificativa', () => {
  assert.throws(
    () => assertTransition('protocolo', 'ARQUIVADO', 'EM_ANDAMENTO'),
    /reabertura exige justificativa/i,
  );
  assert.equal(
    assertTransition('protocolo', 'ARQUIVADO', 'EM_ANDAMENTO', { justificativa: 'Nova análise necessária' }),
    'EM_ANDAMENTO',
  );
});

test('protocolo cancelado pode ser reaberto com justificativa', () => {
  assert.equal(
    assertTransition('protocolo', 'CANCELADO', 'EM_ANDAMENTO', { justificativa: 'Cancelamento equivocado' }),
    'EM_ANDAMENTO',
  );
});
