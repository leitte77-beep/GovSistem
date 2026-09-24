#!/usr/bin/env node
/**
 * Preparação do ambiente local do GovInfra.
 *
 *  1. Confere dependências (Node, Python, Docker)
 *  2. Cria .env.local a partir do .env.example, gerando os segredos
 *  3. Resolve portas livres
 *  4. Cria o ambiente virtual do Python e instala dependências
 *  5. Instala dependências do frontend
 *  6. Sobe banco/Redis/MinIO (Docker) e aplica as migrations
 *  7. Executa a carga de demonstração
 *  8. Mostra as URLs escolhidas
 *
 * Funciona em Linux, macOS e Windows — nenhum passo depende de shell Unix.
 *
 * Opções: --sem-seed, --sem-docker
 */

import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API_DIR = path.join(RAIZ, 'api');
const WEB_DIR = path.join(RAIZ, 'web');
const WINDOWS = process.platform === 'win32';
const VENV_BIN = path.join(API_DIR, '.venv', WINDOWS ? 'Scripts' : 'bin');
const PYTHON_VENV = path.join(VENV_BIN, WINDOWS ? 'python.exe' : 'python');

const argumentos = process.argv.slice(2);
const semSeed = argumentos.includes('--sem-seed');
const semDocker = argumentos.includes('--sem-docker');

const passo = (n, texto) => console.log(`\n[${n}] ${texto}`);
const rodar = (comando, args, opcoes = {}) =>
  execFileSync(comando, args, { stdio: 'inherit', cwd: RAIZ, ...opcoes });

function existe(comando) {
  try {
    execSync(WINDOWS ? `where ${comando}` : `command -v ${comando}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function acharPython() {
  for (const candidato of ['python3.12', 'python3.11', 'python3', 'python']) {
    if (existe(candidato)) return candidato;
  }
  return null;
}

// ── 1. Dependências ──────────────────────────────────────────────────────────
passo(1, 'Conferindo dependências');
const python = acharPython();
if (!python) {
  console.error('  Python 3.10+ não encontrado. Instale o Python antes de continuar.');
  process.exit(1);
}
console.log(`  Node ${process.version}`);
console.log(`  ${execSync(`${python} --version`).toString().trim()}`);
const temDocker = existe('docker');
console.log(`  Docker: ${temDocker ? 'disponível' : 'não encontrado (o modo local sem Docker funciona)'}`);

// ── 2. Configuração ──────────────────────────────────────────────────────────
passo(2, 'Preparando o arquivo de configuração');
const envLocal = path.join(RAIZ, '.env.local');
if (!fs.existsSync(envLocal)) {
  const exemplo = fs.readFileSync(path.join(RAIZ, '.env.example'), 'utf8');
  fs.writeFileSync(
    envLocal,
    exemplo
      .replace('SECRET_KEY=', `SECRET_KEY=${crypto.randomBytes(32).toString('hex')}`)
      .replace('POSTGRES_PASSWORD=', `POSTGRES_PASSWORD=${crypto.randomBytes(12).toString('base64url')}`)
      .replace('INTERNAL_API_KEY=', `INTERNAL_API_KEY=${crypto.randomBytes(24).toString('hex')}`)
      .replace('ENABLE_DEV_SAAS_AUTH=false', 'ENABLE_DEV_SAAS_AUTH=true'),
  );
  console.log('  .env.local criado com segredos gerados localmente.');
} else {
  console.log('  .env.local já existe — mantido como está.');
}

// ── 3. Portas ────────────────────────────────────────────────────────────────
passo(3, 'Resolvendo portas livres');
rodar(process.execPath, [path.join(RAIZ, 'scripts', 'resolve-ports.mjs')]);

// ── 4. Ambiente Python ───────────────────────────────────────────────────────
passo(4, 'Preparando o ambiente Python da API');
if (!fs.existsSync(PYTHON_VENV)) {
  rodar(python, ['-m', 'venv', '.venv'], { cwd: API_DIR });
  console.log('  Ambiente virtual criado em api/.venv');
}
rodar(PYTHON_VENV, ['-m', 'pip', 'install', '--quiet', '--upgrade', 'pip'], { cwd: API_DIR });
rodar(PYTHON_VENV, ['-m', 'pip', 'install', '--quiet', '-r', 'requirements-dev.txt'], { cwd: API_DIR });
console.log('  Dependências da API instaladas.');

// ── 5. Frontend ──────────────────────────────────────────────────────────────
passo(5, 'Instalando dependências do frontend');
if (fs.existsSync(path.join(WEB_DIR, 'package.json'))) {
  rodar('npm', ['install', '--silent'], { cwd: WEB_DIR, shell: WINDOWS });
  console.log('  Dependências do frontend instaladas.');
}

// ── 6. Banco e migrations ────────────────────────────────────────────────────
passo(6, 'Preparando o banco de dados');
const portas = JSON.parse(fs.readFileSync(path.join(RAIZ, '.runtime', 'ports.json'), 'utf8'));
if (temDocker && !semDocker) {
  console.log('  Subindo PostgreSQL, Redis e MinIO via Docker Compose...');
  try {
    rodar('docker', [
      'compose', '-p', 'govinfra', '--env-file', '.env.ports', '--env-file', '.env.local', '-f', 'docker-compose.yml',
      'up', '-d', 'postgres', 'redis', 'minio', 'minio-init',
    ]);
    for (let tentativa = 0; tentativa < 30; tentativa += 1) {
      try {
        execSync('docker compose -p govinfra -f docker-compose.yml exec -T postgres pg_isready', {
          cwd: RAIZ, stdio: 'ignore',
        });
        break;
      } catch {
        execSync(WINDOWS ? 'timeout /t 2 /nobreak > NUL' : 'sleep 2', { stdio: 'ignore', shell: true });
      }
    }
  } catch {
    console.log('  Não foi possível subir os serviços do Docker. Configure DATABASE_URL_OVERRIDE ou suba o banco manualmente.');
  }
} else {
  console.log('  Docker não será usado. Garanta que o PostgreSQL do .env.local esteja acessível.');
}

console.log('  Aplicando migrations...');
const ambienteBanco = {
  ...process.env,
  POSTGRES_HOST: process.env.POSTGRES_HOST || '127.0.0.1',
  POSTGRES_PORT: String(portas.database),
};
try {
  rodar(path.join(VENV_BIN, WINDOWS ? 'alembic.exe' : 'alembic'), ['upgrade', 'head'], {
    cwd: API_DIR,
    env: ambienteBanco,
  });
} catch {
  console.error('  Falha ao aplicar as migrations. Verifique as credenciais do banco em .env.local.');
  process.exit(1);
}

// ── 7. Carga de demonstração ─────────────────────────────────────────────────
if (!semSeed) {
  passo(7, 'Executando a carga de demonstração');
  rodar(PYTHON_VENV, ['-m', 'scripts.seed'], { cwd: API_DIR, env: ambienteBanco });
}

// ── 8. Resumo ────────────────────────────────────────────────────────────────
console.log('\n────────────────────────────────────────────────────────────');
console.log(' GovInfra pronto para uso');
console.log('────────────────────────────────────────────────────────────');
console.log(` Frontend:      http://127.0.0.1:${portas.frontend}`);
console.log(` API:           http://127.0.0.1:${portas.api}/api/govinfra/v1`);
console.log(` Documentação:  http://127.0.0.1:${portas.api}/docs`);
console.log('\n Inicie o ambiente com:  npm run dev\n');
