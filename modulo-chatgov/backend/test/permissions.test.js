import test from 'node:test';
import assert from 'node:assert/strict';
import { hasPermission } from '../src/auth/permissions.js';

test('administrador possui todas as permissões', () => {
  assert.equal(hasPermission('admin', 'canais.gerenciar'), true);
});

test('operador não acessa auditoria nem configurações', () => {
  assert.equal(hasPermission('operador', 'auditoria.visualizar'), false);
  assert.equal(hasPermission('operador', 'configuracoes.gerenciar'), false);
});

test('supervisor possui permissões operacionais por wildcard', () => {
  assert.equal(hasPermission('supervisor', 'conversas.resolver'), true);
});
