import test from 'node:test';
import assert from 'node:assert/strict';
import { assertTransition, normalizeStatus } from '../src/domain/status.js';

test('normaliza status legados sem perder compatibilidade', () => {
  assert.equal(normalizeStatus('conversa', 'fila'), 'NA_FILA');
  assert.equal(normalizeStatus('protocolo', 'encerrado'), 'CONCLUIDO');
});

test('conversa sem atendente não pode ser resolvida', () => {
  assert.throws(
    () => assertTransition('conversa', 'EM_ATENDIMENTO', 'RESOLVIDA', {}),
    /atendente responsável/
  );
});

test('automação registrada pode resolver sem atendente', () => {
  assert.equal(
    assertTransition('conversa', 'EM_ATENDIMENTO', 'RESOLVIDA', { origem: 'automacao' }),
    'RESOLVIDA'
  );
});

test('protocolo concluído exige motivo para reabrir', () => {
  assert.throws(
    () => assertTransition('protocolo', 'CONCLUIDO', 'EM_ANDAMENTO', {}),
    /justificativa/
  );
  assert.equal(
    assertTransition('protocolo', 'CONCLUIDO', 'EM_ANDAMENTO', { justificativa: 'Novo documento' }),
    'EM_ANDAMENTO'
  );
});

test('transição inexistente é rejeitada', () => {
  assert.throws(
    () => assertTransition('conversa', 'ARQUIVADA', 'RESOLVIDA', { operadorId: 'x' }),
    /Transição inválida/
  );
});
