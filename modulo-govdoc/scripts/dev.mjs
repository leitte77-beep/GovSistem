#!/usr/bin/env node
/**
 * Sobe API e frontend em modo de desenvolvimento, sempre em portas verificadas.
 *
 * Uso:
 *   node scripts/dev.mjs                 # API + frontend
 *   node scripts/dev.mjs --apenas api    # somente a API
 *   node scripts/dev.mjs --apenas web    # somente o frontend
 */

import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API_DIR = path.join(RAIZ, 'api');
const WEB_DIR = path.join(RAIZ, 'web');
const WINDOWS = process.platform === 'win32';
const VENV_BIN = path.join(API_DIR, '.venv', WINDOWS ? 'Scripts' : 'bin');

const argumentos = process.argv.slice(2);
const indiceApenas = argumentos.indexOf('--apenas');
const apenas = indiceApenas >= 0 ? argumentos[indiceApenas + 1] : null;

// 1. Portas — sempre resolvidas antes de subir qualquer coisa.
execFileSync(process.execPath, [path.join(RAIZ, 'scripts', 'resolve-ports.mjs')], { stdio: 'inherit' });
const portas = JSON.parse(fs.readFileSync(path.join(RAIZ, '.runtime', 'ports.json'), 'utf8'));

const processos = [];

function iniciar(nome, comando, args, opcoes) {
  const filho = spawn(comando, args, { stdio: 'inherit', shell: WINDOWS, ...opcoes });
  filho.on('exit', (codigo) => {
    if (codigo !== 0 && codigo !== null) console.error(`\n[${nome}] encerrou com código ${codigo}`);
    encerrar();
  });
  processos.push(filho);
  return filho;
}

function encerrar() {
  for (const filho of processos) {
    if (!filho.killed) filho.kill('SIGTERM');
  }
  process.exit(0);
}

process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);

if (apenas !== 'web') {
  iniciar('api', path.join(VENV_BIN, WINDOWS ? 'uvicorn.exe' : 'uvicorn'), [
    'app.main:app',
    '--host',
    '127.0.0.1',
    '--port',
    String(portas.api),
    '--reload',
  ], {
    cwd: API_DIR,
    env: { ...process.env, API_PORT: String(portas.api), FRONTEND_PORT: String(portas.frontend) },
  });
}

if (apenas !== 'api' && fs.existsSync(path.join(WEB_DIR, 'package.json'))) {
  iniciar('web', 'npm', ['run', 'dev', '--', '--port', String(portas.frontend), '--strictPort'], {
    cwd: WEB_DIR,
    env: { ...process.env, VITE_GOVDOC_API_URL: `http://127.0.0.1:${portas.api}` },
  });
}

console.log('\nPressione Ctrl+C para encerrar.\n');
