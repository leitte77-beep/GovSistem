import test from 'node:test';
import assert from 'node:assert/strict';
import { extrairContatosCompartilhados } from '../src/domain/contato-compartilhado.js';

test('extrai contato individual enviado pelo WhatsApp', () => {
  assert.deepEqual(extrairContatosCompartilhados({
    contactMessage: {
      displayName: 'Maria Silva',
      vcard: 'BEGIN:VCARD\nVERSION:3.0\nFN:Maria Silva\nTEL;type=CELL;waid=5511987654321:+55 11 98765-4321\nEND:VCARD',
    },
  }), [{ nome: 'Maria Silva', telefone: '+5511987654321' }]);
});

test('extrai lista de contatos e usa FN quando displayName não existe', () => {
  assert.deepEqual(extrairContatosCompartilhados({
    contactsArrayMessage: {
      contacts: [
        { vcard: 'BEGIN:VCARD\nFN:João Souza\nitem1.TEL;TYPE=CELL;waid=5521999990000:+55 21 99999-0000\nitem1.X-ABLabel:Celular\nEND:VCARD' },
        { displayName: 'Contato sem telefone', vcard: 'BEGIN:VCARD\nEND:VCARD' },
      ],
    },
  }), [
    { nome: 'João Souza', telefone: '+5521999990000' },
    { nome: 'Contato sem telefone', telefone: null },
  ]);
});

test('ignora conteúdo que não é contato', () => {
  assert.deepEqual(extrairContatosCompartilhados({ conversation: 'Olá' }), []);
});
