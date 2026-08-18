# Evidência TDD — fallback da versão do WhatsApp

## Origem e jornada

Sem plano externo. Jornada derivada da falha operacional observada em 2026-08-17:

> Como operador do ChatGov, quero que o backend use uma versão válida do protocolo quando a consulta remota do Baileys falhar, para que sessões persistidas reconectem automaticamente após um rebuild.

## RED

- Comando: `node --test test/wa-version.test.js`
- Resultado: falhou com `ERR_MODULE_NOT_FOUND` para `src/whatsapp/waVersion.js`.
- Garantia exercitada: o resolvedor configurável e o fallback seguro ainda não existiam.

## GREEN

- Comando específico: `node --test test/wa-version.test.js`
- Resultado: PASS.
- Suíte: `npm test`
- Resultado: 11/11 arquivos de teste aprovados, 0 falhas.
- Sintaxe: `node --check src/whatsapp/waVersion.js` e `node --check src/whatsapp/WhatsAppManager.js`.
- Resultado: PASS.

| # | Garantia | Teste | Tipo | Resultado |
|---|----------|-------|------|-----------|
| 1 | Aceita versões no formato com pontos ou vírgulas e rejeita entrada inválida | `test/wa-version.test.js` | unitário | PASS |
| 2 | `WA_VERSION` válida tem prioridade e dispensa a consulta remota | `test/wa-version.test.js` | unitário | PASS |
| 3 | Uma resposta remota confirmada como atual é utilizada | `test/wa-version.test.js` | unitário | PASS |
| 4 | Uma resposta `isLatest=false` não reutiliza a versão antiga embutida no pacote | `test/wa-version.test.js` | unitário | PASS |
| 5 | Timeout/erro remoto seleciona o fallback atual | `test/wa-version.test.js` | unitário | PASS |

## Cobertura e validação operacional

- Comando: `node --test --experimental-test-coverage test/wa-version.test.js`
- `src/whatsapp/waVersion.js`: 93,65% linhas, 88,89% branches, 100% funções.
- Deploy: `docker compose -f modulo-chatgov/docker-compose.yml up -d --build backend`.
- Evidência: logs registraram o fallback `2.3000.1044214717` e `Connected for tenant` para as duas sessões persistidas.
- Banco: as duas linhas com credenciais ficaram com status `conectado`.
- Saúde: `GET http://127.0.0.1:3050/health` retornou `status: ok` em `production`.

## Checkpoints Git

O checkpoint RED não pôde ser gravado porque `.git/index.lock` está em filesystem somente leitura. Os arquivos de teste e implementação permanecem no workspace para revisão e commit posterior.
