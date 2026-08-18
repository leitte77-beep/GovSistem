import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validarDadosAviso,
  operadorEhDestinatario,
  avisoEstaPendente,
  normalizarAviso,
} from '../src/services/avisos.js';

test('valida título, mensagem, prioridade e público do aviso', () => {
  assert.throws(() => validarDadosAviso({ titulo: '', mensagem: 'Texto' }), /título/i);
  assert.throws(() => validarDadosAviso({ titulo: 'Novo recurso', mensagem: '' }), /mensagem/i);
  assert.throws(() => validarDadosAviso({ titulo: 'X', mensagem: 'Y', prioridade: 'máxima' }), /prioridade/i);
  assert.throws(() => validarDadosAviso({ titulo: 'X', mensagem: 'Y', publico: 'pessoas' }), /público/i);
  assert.throws(() => validarDadosAviso({ titulo: 'X', mensagem: 'Y', publico: 'setores', departamento_ids: [] }), /setor/i);
});

test('normaliza conteúdo e limita tamanhos antes de publicar', () => {
  const aviso = normalizarAviso({
    titulo: '  Nova funcionalidade  ', mensagem: '  Agora temos avisos.  ',
    prioridade: 'importante', publico: 'todos', exige_confirmacao: true,
  });
  assert.deepEqual(aviso, {
    titulo: 'Nova funcionalidade', mensagem: 'Agora temos avisos.',
    prioridade: 'importante', publico: 'todos', exigeConfirmacao: true,
    departamentoIds: [], expiraEm: null,
  });
});

test('aviso geral chega a atendente e supervisor, mas não ao administrador autor', () => {
  const aviso = { publico: 'todos', departamentoIds: [] };
  assert.equal(operadorEhDestinatario(aviso, { papel: 'operador', departamentoIds: [] }), true);
  assert.equal(operadorEhDestinatario(aviso, { papel: 'supervisor', departamentoIds: [] }), true);
  assert.equal(operadorEhDestinatario(aviso, { papel: 'admin', departamentoIds: [] }), false);
});

test('aviso por setor chega somente a quem pertence a um dos setores escolhidos', () => {
  const aviso = { publico: 'setores', departamentoIds: ['dep-ti', 'dep-rh'] };
  assert.equal(operadorEhDestinatario(aviso, { papel: 'operador', departamentoIds: ['dep-ti'] }), true);
  assert.equal(operadorEhDestinatario(aviso, { papel: 'operador', departamentoIds: ['dep-obras'] }), false);
});

test('aviso com confirmação continua pendente até Li e entendi', () => {
  const aviso = { ativo: true, exigeConfirmacao: true, lidoEm: new Date(), confirmadoEm: null, expiraEm: null };
  assert.equal(avisoEstaPendente(aviso), true);
  assert.equal(avisoEstaPendente({ ...aviso, confirmadoEm: new Date() }), false);
});

test('aviso sem confirmação deixa de aparecer depois de lido e respeita validade', () => {
  const base = { ativo: true, exigeConfirmacao: false, lidoEm: null, confirmadoEm: null, expiraEm: null };
  assert.equal(avisoEstaPendente(base), true);
  assert.equal(avisoEstaPendente({ ...base, lidoEm: new Date() }), false);
  assert.equal(avisoEstaPendente({ ...base, expiraEm: new Date(Date.now() - 1000) }), false);
  assert.equal(avisoEstaPendente({ ...base, ativo: false }), false);
});
