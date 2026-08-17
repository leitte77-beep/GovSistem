import test from 'node:test';
import assert from 'node:assert/strict';
import { formatarMenuSetores, detectarEscolhaMenu } from '../src/services/iris.js';

test('monta menu com saudação do município e setores numerados', () => {
  const menu = formatarMenuSetores('Prefeitura Municipal de Farol', [
    'Recursos Humanos',
    'Tributação',
    'Saúde',
  ]);

  assert.ok(menu.includes('assistente virtual da Prefeitura Municipal de Farol'));
  assert.ok(menu.includes('1️⃣ Recursos Humanos'));
  assert.ok(menu.includes('2️⃣ Tributação'));
  assert.ok(menu.includes('3️⃣ Saúde'));
  assert.ok(menu.includes('Digite o número ou o nome do setor desejado'));
});

test('numera 10 com 🔟 e 11 com keycaps combinados', () => {
  const setores = Array.from({ length: 11 }, (_, i) => `Setor ${i + 1}`);
  const menu = formatarMenuSetores('Município X', setores);

  assert.ok(menu.includes('🔟 Setor 10'));
  assert.ok(menu.includes('1️⃣1️⃣ Setor 11'));
});

test('sem nome de tenant usa saudação genérica', () => {
  const menu = formatarMenuSetores('', ['Geral']);
  assert.ok(menu.includes('assistente virtual da Prefeitura Municipal'));
});

test('sem setores exibe aviso de indisponibilidade', () => {
  const menu = formatarMenuSetores('Município X', []);
  assert.ok(menu.includes('não há setores disponíveis'));
});

test('detecta escolha numérica pura do menu', () => {
  assert.equal(detectarEscolhaMenu('3'), 3);
  assert.equal(detectarEscolhaMenu(' 11 '), 11);
  assert.equal(detectarEscolhaMenu('3️⃣'), 3);
  assert.equal(detectarEscolhaMenu('1️⃣1️⃣'), 11);
});

test('não trata frases com letras como escolha numérica', () => {
  assert.equal(detectarEscolhaMenu('preciso de 3 documentos'), null);
  assert.equal(detectarEscolhaMenu('opção 3'), null);
  assert.equal(detectarEscolhaMenu('saúde'), null);
  assert.equal(detectarEscolhaMenu(''), null);
});
