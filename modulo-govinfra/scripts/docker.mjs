#!/usr/bin/env node
/**
 * Sobe/derruba a pilha do GovInfra no Docker, sempre em portas verificadas.
 *
 *   node scripts/docker.mjs up      # resolve portas e sobe tudo
 *   node scripts/docker.mjs down    # derruba apenas os serviços do GovInfra
 *   node scripts/docker.mjs logs    # acompanha os registros
 *
 * O projeto é sempre `-p govinfra`, e nunca se usa `--remove-orphans`: isso
 * evita derrubar contêineres de outros módulos do sistema.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const acao = process.argv[2] || 'up';
const extras = process.argv.slice(3);

const base = ['compose', '-p', 'govinfra', '--env-file', '.env.ports', '--env-file', '.env.local', '-f', 'docker-compose.yml'];

function compose(args) {
  execFileSync('docker', [...base, ...args], { stdio: 'inherit', cwd: RAIZ });
}

if (acao === 'up') {
  execFileSync(process.execPath, [path.join(RAIZ, 'scripts', 'resolve-ports.mjs')], { stdio: 'inherit' });
  compose(['up', '-d', '--build', ...extras]);
  const portas = JSON.parse(fs.readFileSync(path.join(RAIZ, '.runtime', 'ports.json'), 'utf8'));
  console.log(`\n GovInfra no ar:  http://127.0.0.1:${portas.frontend}`);
  console.log(` API:             http://127.0.0.1:${portas.api}/docs\n`);
} else if (acao === 'down') {
  compose(['down', ...extras]);
} else if (acao === 'logs') {
  compose(['logs', '-f', '--tail', '200', ...extras]);
} else {
  compose([acao, ...extras]);
}
