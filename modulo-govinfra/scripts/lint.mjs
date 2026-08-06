#!/usr/bin/env node
/** Verificação estática: ruff na API e typecheck no frontend. */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API_DIR = path.join(RAIZ, 'api');
const WEB_DIR = path.join(RAIZ, 'web');
const WINDOWS = process.platform === 'win32';
const PYTHON = path.join(API_DIR, '.venv', WINDOWS ? 'Scripts' : 'bin', WINDOWS ? 'python.exe' : 'python');

let falhou = false;

try {
  execFileSync(PYTHON, ['-m', 'ruff', 'check', 'app', 'scripts', 'tests'], { stdio: 'inherit', cwd: API_DIR });
} catch {
  falhou = true;
}

if (fs.existsSync(path.join(WEB_DIR, 'node_modules'))) {
  try {
    execFileSync('npm', ['run', 'typecheck'], { stdio: 'inherit', cwd: WEB_DIR, shell: WINDOWS });
  } catch {
    falhou = true;
  }
} else {
  console.log('\n[web] node_modules ausente — rode `npm run setup` para verificar o frontend.');
}

process.exit(falhou ? 1 : 0);
