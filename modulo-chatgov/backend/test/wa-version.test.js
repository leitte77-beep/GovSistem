import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FALLBACK_WA_VERSION,
  parseWaVersion,
  resolveWaVersion,
} from '../src/whatsapp/waVersion.js';

const silentLogger = { info() {}, warn() {} };

test('interpreta versão configurada nos formatos ponto e vírgula', () => {
  assert.deepEqual(parseWaVersion('2.3000.1044214717'), [2, 3000, 1044214717]);
  assert.deepEqual(parseWaVersion('2,3000,1044214717'), [2, 3000, 1044214717]);
  assert.equal(parseWaVersion('versao-invalida'), null);
});

test('versão configurada tem prioridade e evita consulta remota', async () => {
  let consultou = false;
  const result = await resolveWaVersion({
    configuredVersion: '2.3000.1044214717',
    fetchLatest: async () => {
      consultou = true;
      return { version: [2, 3000, 9999999999], isLatest: true };
    },
    logger: silentLogger,
  });

  assert.deepEqual(result, [2, 3000, 1044214717]);
  assert.equal(consultou, false);
});

test('usa a versão remota somente quando a consulta confirma que é atual', async () => {
  const result = await resolveWaVersion({
    fetchLatest: async () => ({ version: [2, 3000, 1045000000], isLatest: true }),
    logger: silentLogger,
  });

  assert.deepEqual(result, [2, 3000, 1045000000]);
});

test('usa fallback atual quando consulta retorna versão embutida antiga', async () => {
  const result = await resolveWaVersion({
    fetchLatest: async () => ({
      version: [2, 3000, 1023223821],
      isLatest: false,
      error: new Error('raw.githubusercontent.com indisponível'),
    }),
    logger: silentLogger,
  });

  assert.deepEqual(result, FALLBACK_WA_VERSION);
});

test('usa fallback atual quando consulta remota lança erro', async () => {
  const result = await resolveWaVersion({
    fetchLatest: async () => { throw new Error('timeout'); },
    logger: silentLogger,
  });

  assert.deepEqual(result, FALLBACK_WA_VERSION);
});
