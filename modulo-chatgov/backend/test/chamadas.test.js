import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MENSAGEM_CHAMADA_PADRAO,
  formatarTelefoneBR,
  montarMensagemChamada,
  resolverNomeOrgao,
  resolverTelefoneOrgao,
} from '../src/services/chamadas.js';

test('formata o número da sessão como telefone fixo', () => {
  assert.equal(formatarTelefoneBR('554435631101'), '(44) 3563-1101');
});

test('formata celular com o nono dígito', () => {
  assert.equal(formatarTelefoneBR('5544997372117'), '(44) 99737-2117');
});

test('mantém celular antigo como o WhatsApp o conhece, sem inventar o nono dígito', () => {
  assert.equal(formatarTelefoneBR('554497372117'), '(44) 9737-2117');
});

test('aceita número já sem o código do país', () => {
  assert.equal(formatarTelefoneBR('4435631101'), '(44) 3563-1101');
});

test('devolve null quando não há número discável', () => {
  for (const entrada of ['', null, undefined, 'abc', '5544']) {
    assert.equal(formatarTelefoneBR(entrada), null);
  }
});

test('telefone configurado tem prioridade sobre o número conectado', () => {
  assert.equal(
    resolverTelefoneOrgao({ telefoneConfigurado: '(44) 3563-1101', numeroSessao: '554497372117' }),
    '(44) 3563-1101'
  );
});

test('sem telefone configurado, deriva do número conectado', () => {
  assert.equal(
    resolverTelefoneOrgao({ telefoneConfigurado: '   ', numeroSessao: '554435631101' }),
    '(44) 3563-1101'
  );
});

test('nome de exibição tem prioridade sobre o cadastro em caixa alta', () => {
  assert.equal(
    resolverNomeOrgao({ nomeExibicao: 'Prefeitura Municipal de Farol', nomeTenant: 'PREFEITURA DE FAROL' }),
    'Prefeitura Municipal de Farol'
  );
  assert.equal(
    resolverNomeOrgao({ nomeExibicao: '', nomeTenant: 'CAMARA MUNICIPAL DE FAROL' }),
    'CAMARA MUNICIPAL DE FAROL'
  );
});

test('monta a mensagem trocando órgão e telefone em todas as ocorrências', () => {
  const texto = montarMensagemChamada({
    template: null,
    orgao: 'Prefeitura Municipal de Farol',
    telefone: '(44) 3563-1101',
  });
  assert.ok(!texto.includes('{orgao}'));
  assert.ok(!texto.includes('{telefone}'));
  assert.ok(texto.includes('(44) 3563-1101'));
  // O nome aparece no corpo e na assinatura.
  assert.equal(texto.split('Prefeitura Municipal de Farol').length - 1, 2);
});

test('template personalizado do órgão substitui o padrão', () => {
  const texto = montarMensagemChamada({
    template: 'Ligue para {telefone}.',
    orgao: 'Câmara',
    telefone: '(44) 3563-1101',
  });
  assert.equal(texto, 'Ligue para (44) 3563-1101.');
});

test('template vazio cai no texto padrão', () => {
  const texto = montarMensagemChamada({ template: '   ', orgao: 'X', telefone: 'Y' });
  assert.equal(texto, MENSAGEM_CHAMADA_PADRAO.replaceAll('{orgao}', 'X').replaceAll('{telefone}', 'Y').trim());
});
