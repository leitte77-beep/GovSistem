#!/usr/bin/env node
/**
 * Gerenciador de portas do GovInfra.
 *
 * Confere se as portas preferenciais estão livres (0.0.0.0, 127.0.0.1 e ::1) e,
 * no modo automático, escolhe a próxima porta disponível dentro da faixa
 * reservada do módulo (44000-44699 — nenhum outro módulo do sistema usa essa
 * faixa: govdoc ocupa 43000-43699, os demais ficam abaixo de 16000).
 *
 * Regras que este script NUNCA quebra:
 *   • não encerra processo nenhum para liberar porta;
 *   • não altera configuração ou porta de outros módulos;
 *   • no modo fixo, falha com mensagem clara em vez de trocar de porta calado.
 *
 * Uso:
 *   node scripts/resolve-ports.mjs            # resolve e grava .runtime/ports.json
 *   node scripts/resolve-ports.mjs --check    # apenas verifica, não grava
 *   node scripts/resolve-ports.mjs --json     # saída em JSON (para outros scripts)
 */

import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUNTIME_DIR = path.join(RAIZ, '.runtime');
const PORTS_FILE = path.join(RUNTIME_DIR, 'ports.json');
const ENV_PORTS_FILE = path.join(RAIZ, '.env.ports');
const WEB_ENV_FILE = path.join(RAIZ, 'web', '.env.local');

/**
 * Faixas preferenciais — exclusivas do GovInfra.
 * `env` é o nome da variável lida do .env.local (preferência do operador) e
 * `envSaida` o nome gravado no .env.ports consumido pelo Docker Compose.
 */
const SERVICOS = [
  { chave: 'frontend', env: 'GOVINFRA_FRONTEND_PORT', envSaida: 'FRONTEND_PORT', rotulo: 'Frontend', inicio: 44000, fim: 44099 },
  { chave: 'api', env: 'GOVINFRA_API_PORT', envSaida: 'API_PORT', rotulo: 'API', inicio: 44100, fim: 44199 },
  { chave: 'storageConsole', env: 'GOVINFRA_STORAGE_CONSOLE_PORT', envSaida: 'STORAGE_CONSOLE_PORT', rotulo: 'Console do armazenamento', inicio: 44200, fim: 44299 },
  { chave: 'storage', env: 'GOVINFRA_STORAGE_PORT', envSaida: 'STORAGE_API_PORT', rotulo: 'API do armazenamento', inicio: 44300, fim: 44399 },
  { chave: 'tiles', env: 'GOVINFRA_TILES_PORT', envSaida: 'TILES_PORT', rotulo: 'Servidor de mapas (opcional)', inicio: 44400, fim: 44499 },
  { chave: 'database', env: 'GOVINFRA_DATABASE_PORT', envSaida: 'POSTGRES_HOST_PORT', rotulo: 'Banco de dados (host)', inicio: 44500, fim: 44599 },
  { chave: 'redis', env: 'GOVINFRA_REDIS_PORT', envSaida: 'REDIS_HOST_PORT', rotulo: 'Redis (host)', inicio: 44600, fim: 44699 },
];

const HOSTS = ['0.0.0.0', '127.0.0.1', '::1'];

function lerEnv(arquivo) {
  if (!fs.existsSync(arquivo)) return {};
  const dados = {};
  for (const linha of fs.readFileSync(arquivo, 'utf8').split('\n')) {
    const texto = linha.trim();
    if (!texto || texto.startsWith('#')) continue;
    const igual = texto.indexOf('=');
    if (igual === -1) continue;
    dados[texto.slice(0, igual).trim()] = texto.slice(igual + 1).trim().replace(/^["']|["']$/g, '');
  }
  return dados;
}

/** Testa uma porta em todos os endereços relevantes. */
function portaLivre(porta) {
  return HOSTS.reduce(async (anterior, host) => {
    if (!(await anterior)) return false;
    return new Promise((resolve) => {
      const servidor = net.createServer();
      servidor.once('error', (erro) => {
        // Família de endereço indisponível (ex.: IPv6 desligado) não é conflito.
        if (erro.code === 'EAFNOSUPPORT' || erro.code === 'EADDRNOTAVAIL') resolve(true);
        else resolve(false);
      });
      servidor.once('listening', () => servidor.close(() => resolve(true)));
      try {
        servidor.listen({ port: porta, host, exclusive: true });
      } catch {
        resolve(false);
      }
    });
  }, Promise.resolve(true));
}

/** Descobre, quando possível, quem ocupa a porta — apenas informativo. */
function quemUsa(porta) {
  try {
    if (process.platform === 'win32') {
      const saida = execSync(`netstat -ano | findstr :${porta}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
      return saida.trim().split('\n')[0]?.trim() || null;
    }
    const saida = execSync(
      `ss -ltnp 2>/dev/null | grep ':${porta} ' || lsof -i :${porta} -sTCP:LISTEN 2>/dev/null || true`,
      { stdio: ['ignore', 'pipe', 'ignore'], shell: '/bin/bash' },
    ).toString();
    return saida.trim().split('\n')[0]?.trim() || null;
  } catch {
    return null;
  }
}

async function resolver({ modo, env }) {
  const resultado = {};
  const avisos = [];
  const reservadas = new Set();

  for (const servico of SERVICOS) {
    const preferida = Number(env[servico.env] || servico.inicio + 1);

    if (modo === 'fixed') {
      if (!(await portaLivre(preferida))) {
        const ocupante = quemUsa(preferida);
        throw new Error(
          `A porta ${preferida} (${servico.rotulo}) está ocupada e PORT_MODE=fixed.\n` +
            (ocupante ? `  Aparenta estar em uso por: ${ocupante}\n` : '') +
            `  Ajuste ${servico.env} no .env.local ou use PORT_MODE=auto.`,
        );
      }
      resultado[servico.chave] = preferida;
      reservadas.add(preferida);
      continue;
    }

    let escolhida = null;
    const candidatas = [
      preferida,
      ...Array.from({ length: servico.fim - servico.inicio + 1 }, (_, i) => servico.inicio + i),
    ];
    for (const porta of candidatas) {
      if (porta < servico.inicio || porta > servico.fim) continue;
      if (reservadas.has(porta)) continue;
      if (await portaLivre(porta)) {
        escolhida = porta;
        break;
      }
    }
    if (escolhida === null) {
      throw new Error(
        `Nenhuma porta livre para ${servico.rotulo} na faixa ${servico.inicio}-${servico.fim}.\n` +
          '  Libere portas dessa faixa ou ajuste as faixas em scripts/resolve-ports.mjs.',
      );
    }
    if (escolhida !== preferida) {
      const ocupante = quemUsa(preferida);
      avisos.push(
        `A porta ${preferida} já estava em uso. ${servico.rotulo} usará a porta ${escolhida}.` +
          (ocupante ? ` (ocupada por: ${ocupante})` : ''),
      );
    }
    reservadas.add(escolhida);
    resultado[servico.chave] = escolhida;
  }

  return { portas: resultado, avisos };
}

function gravar(portas) {
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  fs.writeFileSync(
    PORTS_FILE,
    `${JSON.stringify({ ...portas, host: '127.0.0.1', generatedAt: new Date().toISOString() }, null, 2)}\n`,
  );

  // Consumido pelo Docker Compose (--env-file .env.ports) e pelos scripts.
  const linhas = SERVICOS.map((s) => `${s.envSaida}=${portas[s.chave]}`);
  linhas.push(`GOVINFRA_API_URL=http://127.0.0.1:${portas.api}`);
  linhas.push(`GOVINFRA_FRONTEND_URL=http://127.0.0.1:${portas.frontend}`);
  fs.writeFileSync(
    ENV_PORTS_FILE,
    `# Gerado por scripts/resolve-ports.mjs — não versionar.\n${linhas.join('\n')}\n`,
  );

  // O frontend nunca tem a URL da API fixada no código-fonte.
  fs.mkdirSync(path.join(RAIZ, 'web'), { recursive: true });
  fs.writeFileSync(
    WEB_ENV_FILE,
    [
      '# Gerado por scripts/resolve-ports.mjs — não versionar.',
      `VITE_GOVINFRA_API_URL=http://127.0.0.1:${portas.api}`,
      `VITE_GOVINFRA_PORT=${portas.frontend}`,
      // Ponte de login de desenvolvimento (formulário na tela /entrar).
      'VITE_ENABLE_SAAS_LOGIN=true',
      '',
    ].join('\n'),
  );
}

function imprimirResumo(portas, avisos) {
  const linha = (rotulo, valor) => `${rotulo.padEnd(28)} ${valor}`;
  console.log('\nGovInfra — Secretaria de Infraestrutura — portas resolvidas\n');
  console.log(linha('Frontend:', `http://127.0.0.1:${portas.frontend}`));
  console.log(linha('API:', `http://127.0.0.1:${portas.api}/api/govinfra/v1`));
  console.log(linha('Documentação da API:', `http://127.0.0.1:${portas.api}/docs`));
  console.log(linha('Armazenamento (S3):', `http://127.0.0.1:${portas.storage}`));
  console.log(linha('Console do armazenamento:', `http://127.0.0.1:${portas.storageConsole}`));
  console.log(linha('Banco (host):', `127.0.0.1:${portas.database}`));
  console.log(linha('Redis (host):', `127.0.0.1:${portas.redis}`));

  if (avisos.length === 0) {
    console.log('\nNenhum conflito de portas encontrado.\n');
  } else {
    console.log('');
    for (const aviso of avisos) console.log(`  • ${aviso}`);
    console.log('\nNenhum processo externo foi encerrado.\n');
  }
}

async function principal() {
  const argumentos = process.argv.slice(2);
  const apenasVerificar = argumentos.includes('--check');
  const saidaJson = argumentos.includes('--json');

  const env = {
    ...lerEnv(path.join(RAIZ, '.env')),
    ...lerEnv(path.join(RAIZ, '.env.local')),
    ...process.env,
  };
  const modo = (env.PORT_MODE || 'auto').toLowerCase();

  try {
    const { portas, avisos } = await resolver({ modo, env });
    if (!apenasVerificar) gravar(portas);
    if (saidaJson) {
      console.log(JSON.stringify({ modo, portas, avisos }, null, 2));
    } else {
      imprimirResumo(portas, avisos);
      if (apenasVerificar) console.log('Verificação apenas — nenhum arquivo foi gravado.\n');
    }
  } catch (erro) {
    console.error(`\nNão foi possível resolver as portas.\n\n${erro.message}\n`);
    process.exit(1);
  }
}

principal();
