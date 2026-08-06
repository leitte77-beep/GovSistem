#!/usr/bin/env node
/**
 * Gerenciador de portas do GovDoc.
 *
 * Verifica se as portas preferenciais estão livres (IPv4, IPv6, localhost e
 * 127.0.0.1) e, no modo automático, escolhe a próxima porta disponível dentro
 * da faixa reservada do módulo.
 *
 * Regras que este script NUNCA quebra:
 *   • não encerra processo nenhum para liberar porta;
 *   • não altera configuração de outros projetos;
 *   • no modo fixo, falha com mensagem clara em vez de trocar de porta em silêncio.
 *
 * Uso:
 *   node scripts/resolve-ports.mjs            # resolve e grava .runtime/ports.json
 *   node scripts/resolve-ports.mjs --check    # apenas verifica, não grava
 *   node scripts/resolve-ports.mjs --json     # saída em JSON (para scripts)
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

/** Faixas preferenciais — exclusivas do GovDoc para reduzir colisão. */
const SERVICOS = [
  { chave: 'frontend', env: 'FRONTEND_PORT', rotulo: 'Frontend', inicio: 43000, fim: 43099 },
  { chave: 'api', env: 'API_PORT', rotulo: 'API', inicio: 43100, fim: 43199 },
  { chave: 'storageConsole', env: 'STORAGE_CONSOLE_PORT', rotulo: 'Console do armazenamento', inicio: 43200, fim: 43299 },
  { chave: 'storageApi', env: 'STORAGE_API_PORT', rotulo: 'API do armazenamento', inicio: 43300, fim: 43399 },
  { chave: 'mail', env: 'MAIL_PORT', rotulo: 'Serviço de e-mail local', inicio: 43400, fim: 43499 },
  { chave: 'postgres', env: 'POSTGRES_HOST_PORT', rotulo: 'Banco de dados (host)', inicio: 43500, fim: 43599 },
  { chave: 'redis', env: 'REDIS_HOST_PORT', rotulo: 'Redis (host)', inicio: 43600, fim: 43699 },
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
        // Família de endereço indisponível (ex.: IPv6 desabilitado) não é conflito.
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

/** Descobre, quando possível, quem está ocupando a porta (apenas informativo). */
function quemUsa(porta) {
  try {
    if (process.platform === 'win32') {
      const saida = execSync(`netstat -ano | findstr :${porta}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
      return saida.trim().split('\n')[0]?.trim() || null;
    }
    const saida = execSync(`ss -ltnp 2>/dev/null | grep ':${porta} ' || lsof -i :${porta} -sTCP:LISTEN 2>/dev/null || true`, {
      stdio: ['ignore', 'pipe', 'ignore'],
      shell: '/bin/bash',
    }).toString();
    return saida.trim().split('\n')[0]?.trim() || null;
  } catch {
    return null;
  }
}

async function resolver({ modo, env, reservadas }) {
  const resultado = {};
  const avisos = [];

  for (const servico of SERVICOS) {
    const preferida = Number(env[servico.env] || servico.inicio + 1);

    if (modo === 'fixed') {
      const livre = await portaLivre(preferida);
      if (!livre) {
        const ocupante = quemUsa(preferida);
        throw new Error(
          `A porta ${preferida} (${servico.rotulo}) está ocupada e o modo de portas é "fixed".\n` +
            (ocupante ? `  Aparenta estar em uso por: ${ocupante}\n` : '') +
            `  Altere ${servico.env} no arquivo .env.local ou use PORT_MODE=auto.`,
        );
      }
      resultado[servico.chave] = preferida;
      continue;
    }

    let escolhida = null;
    const candidatas = [preferida, ...Array.from({ length: servico.fim - servico.inicio + 1 }, (_, i) => servico.inicio + i)];
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
        `Nenhuma porta livre encontrada para ${servico.rotulo} na faixa ${servico.inicio}-${servico.fim}.\n` +
          '  Libere portas nessa faixa ou ajuste as faixas em scripts/resolve-ports.mjs.',
      );
    }
    if (escolhida !== preferida) {
      const ocupante = quemUsa(preferida);
      avisos.push(
        `A porta ${preferida} já está em uso. ${servico.rotulo} foi iniciado automaticamente na porta ${escolhida}.` +
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

  const conteudo = {
    ...portas,
    host: '127.0.0.1',
    generatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(PORTS_FILE, `${JSON.stringify(conteudo, null, 2)}\n`);

  // Arquivo lido pelo Docker Compose e pelos scripts de execução.
  const linhas = SERVICOS.map((s) => `${s.env}=${portas[s.chave]}`);
  linhas.push(`GOVDOC_API_URL=http://127.0.0.1:${portas.api}`);
  linhas.push(`GOVDOC_FRONTEND_URL=http://127.0.0.1:${portas.frontend}`);
  // GOVDOC_PUBLIC_URL (ex.: https://govdoc.govsistem.com.br) é preservada entre
  // execuções: se veio no .env.ports anterior ou no ambiente, segue valendo.
  const publicaAnterior = fs
    .readFileSync(ENV_PORTS_FILE, 'utf8')
    .split('\n')
    .find((l) => l.startsWith('GOVDOC_PUBLIC_URL='));
  const publica = process.env.GOVDOC_PUBLIC_URL
    || (publicaAnterior ? publicaAnterior.split('=')[1] : '');
  if (publica) linhas.push(`GOVDOC_PUBLIC_URL=${publica}`);
  fs.writeFileSync(ENV_PORTS_FILE, `# Gerado por scripts/resolve-ports.mjs — não versionar.\n${linhas.join('\n')}\n`);

  // O frontend nunca tem a URL da API fixada no código.
  fs.mkdirSync(path.join(RAIZ, 'web'), { recursive: true });
  fs.writeFileSync(
    WEB_ENV_FILE,
    [
      '# Gerado por scripts/resolve-ports.mjs — não versionar.',
      `VITE_GOVDOC_API_URL=http://127.0.0.1:${portas.api}`,
      `VITE_GOVDOC_PORT=${portas.frontend}`,
      '',
    ].join('\n'),
  );
}

function imprimirResumo(portas, avisos) {
  const linha = (rotulo, url) => `${rotulo.padEnd(26)} ${url}`;
  console.log('\nGestão de Documentos (GovDoc) — portas resolvidas\n');
  console.log(linha('Frontend:', `http://127.0.0.1:${portas.frontend}`));
  console.log(linha('API:', `http://127.0.0.1:${portas.api}`));
  console.log(linha('Documentação da API:', `http://127.0.0.1:${portas.api}/docs`));
  console.log(linha('Armazenamento (S3):', `http://127.0.0.1:${portas.storageApi}`));
  console.log(linha('Console do armazenamento:', `http://127.0.0.1:${portas.storageConsole}`));
  console.log(linha('Banco (host):', `127.0.0.1:${portas.postgres}`));
  console.log(linha('Redis (host):', `127.0.0.1:${portas.redis}`));

  if (avisos.length === 0) {
    console.log('\nNenhum conflito de portas foi encontrado.\n');
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

  const env = { ...lerEnv(path.join(RAIZ, '.env')), ...lerEnv(path.join(RAIZ, '.env.local')), ...process.env };
  const modo = (env.PORT_MODE || 'auto').toLowerCase();

  try {
    const { portas, avisos } = await resolver({ modo, env, reservadas: new Set() });
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
