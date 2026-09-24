import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone } from '../src/domain/phone.js';

test('normaliza celular brasileiro em E.164', () => {
  assert.deepEqual(normalizePhone('(11) 98765-4321'), {
    phoneE164: '+5511987654321',
    phoneDisplay: '+55 (11) 98765-4321',
    countryCode: '55',
    areaCode: '11',
    localNumber: '987654321',
  });
});

test('rejeita telefone curto', () => {
  assert.throws(() => normalizePhone('123'), /inválido/);
});
