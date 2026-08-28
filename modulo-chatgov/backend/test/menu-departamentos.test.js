import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CABECALHO_MENU_PADRAO,
  RODAPE_MENU,
  montarMenuDepartamentos,
  interpretarEscolhaMenu,
} from '../src/services/menu-departamentos.js';

const DEPTOS = [
  { id: 'c', nome: 'Tributação', menu_numero: 4 },
  { id: 'a', nome: 'Geral', menu_numero: 1 },
  { id: 'b', nome: 'Arrecadação', menu_numero: 2 },
];

test('lista os setores na ordem do número, não na ordem recebida', () => {
  const texto = montarMenuDepartamentos({ departamentos: DEPTOS });
  const linhas = texto.split('\n').filter((l) => /^\d+ - /.test(l));
  assert.deepEqual(linhas, ['1 - Geral', '2 - Arrecadação', '4 - Tributação']);
});

test('usa o cabeçalho padrão e sempre fecha com a instrução', () => {
  const texto = montarMenuDepartamentos({ departamentos: DEPTOS });
  assert.ok(texto.startsWith(CABECALHO_MENU_PADRAO));
  assert.ok(texto.endsWith(RODAPE_MENU));
});

test('cabeçalho personalizado do órgão substitui o padrão', () => {
  const texto = montarMenuDepartamentos({ cabecalho: 'Escolha o setor:', departamentos: DEPTOS });
  assert.ok(texto.startsWith('Escolha o setor:'));
  assert.ok(!texto.includes(CABECALHO_MENU_PADRAO));
});

test('numeração com buracos é preservada (setor desativado não renumera os outros)', () => {
  const texto = montarMenuDepartamentos({ departamentos: DEPTOS });
  assert.ok(texto.includes('4 - Tributação'));
  assert.ok(!texto.includes('3 - Tributação'));
});

test('lê a escolha do cidadão em formatos comuns', () => {
  for (const [entrada, esperado] of [
    ['4', 4],
    [' 4 ', 4],
    ['4.', 4],
    ['4)', 4],
    ['opção 4', 4],
    ['opcao 4', 4],
    ['18', 18],
  ]) {
    assert.equal(interpretarEscolhaMenu(entrada), esperado, `entrada: ${entrada}`);
  }
});

test('não sequestra frase que apenas começa com número', () => {
  for (const entrada of [
    '2 semanas atrás eu protocolei um pedido',
    'preciso falar com o setor 4',
    'bom dia',
    '',
    null,
    '0',
  ]) {
    assert.equal(interpretarEscolhaMenu(entrada), null, `entrada: ${entrada}`);
  }
});
