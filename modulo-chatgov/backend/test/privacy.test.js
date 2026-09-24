import test from 'node:test';
import assert from 'node:assert/strict';
import { maskCpf, maskPhone, protectSensitiveFields } from '../src/domain/privacy.js';

test('CPF é mascarado sem permissão', () => {
  assert.equal(maskCpf('12345678901'), '***.456.789-**');
  assert.equal(protectSensitiveFields({ cpf: '12345678901' }, false).cpf, '***.456.789-**');
});

test('dados sensíveis permanecem disponíveis com permissão', () => {
  const row = { cpf: '12345678901', email: 'cidadao@exemplo.gov.br' };
  assert.deepEqual(protectSensitiveFields(row, true), row);
});

test('telefone possui forma mascarada previsível', () => {
  assert.equal(maskPhone('+55 (11) 99999-1234'), '*********1234');
});
