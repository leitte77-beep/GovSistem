#!/usr/bin/env node
/**
 * Atalho para o Docker Compose do GovDoc, sempre com as portas resolvidas.
 *
 *   node scripts/docker.mjs up      # sobe tudo em segundo plano
 *   node scripts/docker.mjs down    # derruba apenas o stack do GovDoc
 *   node scripts/docker.mjs logs    # acompanha os logs
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const acao = process.argv[2] || 'up';

execFileSync(process.execPath, [path.join(RAIZ, 'scripts', 'resolve-ports.mjs')], { stdio: 'inherit' });

const comuns = ['compose', '--project-name', 'govdoc', '--env-file', '.env.ports', '-f', 'docker-compose.yml'];
const mapa = {
  up: [...comuns, 'up', '-d', '--build'],
  down: [...comuns, 'down'],
  logs: [...comuns, 'logs', '-f'],
  ps: [...comuns, 'ps'],
};

if (!mapa[acao]) {
  console.error(`Ação desconhecida: ${acao}. Use up, down, logs ou ps.`);
  process.exit(1);
}

try {
  execFileSync('docker', mapa[acao], { stdio: 'inherit', cwd: RAIZ });
} catch (erro) {
  process.exit(erro.status || 1);
}

if (acao === 'up') {
  const portas = JSON.parse(fs.readFileSync(path.join(RAIZ, '.runtime', 'ports.json'), 'utf8'));
  console.log(`\n  Frontend: http://127.0.0.1:${portas.frontend}`);
  console.log(`  API:      http://127.0.0.1:${portas.api}/docs\n`);
}
