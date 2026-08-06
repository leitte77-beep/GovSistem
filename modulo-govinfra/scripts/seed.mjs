#!/usr/bin/env node
/** Carga de demonstração do GovInfra (idempotente — pode rodar quantas vezes quiser). */

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API_DIR = path.join(RAIZ, 'api');
const WINDOWS = process.platform === 'win32';
const PYTHON = path.join(API_DIR, '.venv', WINDOWS ? 'Scripts' : 'bin', WINDOWS ? 'python.exe' : 'python');

try {
  execFileSync(PYTHON, ['-m', 'scripts.seed', ...process.argv.slice(2)], {
    stdio: 'inherit',
    cwd: API_DIR,
  });
} catch (erro) {
  process.exit(erro.status || 1);
}
