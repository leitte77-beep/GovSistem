# GovTask — operação, deploy e permissões

Documento de quem publica e sustenta o módulo. A arquitetura e as decisões de
domínio estão em [GOVTASK_V2_ARQUITETURA.md](GOVTASK_V2_ARQUITETURA.md); o
histórico por entrega, em [CHANGELOG.md](CHANGELOG.md).

## 1. Onde o módulo roda

| Serviço | Imagem/contexto | Porta no host | Observação |
|---|---|---|---|
| `govtask-api` | `modulo-govtask/api` | `8101 → 8000` | FastAPI; health em `/api/govtask/health` |
| `govtask-web` | `modulo-govtask/web-admin` | `7301 → 3000` | Next.js |
| `govtask-db-init` | `postgres:16-alpine` | — | Cria o banco `govtask` se não existir e sai |

O banco é **um schema próprio dentro do PostgreSQL compartilhado** da
plataforma (`GOVTASK_POSTGRES_DB`, padrão `govtask`), não uma instância
separada.

> Depois de recriar o container de um módulo, a borda responde 502 até o nginx
> reler os endereços: `docker exec infra-nginx-1 nginx -s reload`.

### Qual arquivo de compose usar

Três arquivos diferentes alimentam o **mesmo** projeto Compose (`infra`), e o
GovTask está em dois deles com valores diferentes:

| Serviços em execução | Arquivo que os criou |
|---|---|
| `govtask-api`, `govtask-web`, `nginx`, `landing`, `postgres`, `redis`, `minio`, `api`, `web-admin`, `web-public`, `worker`, `beat`, `signer` | `infra/docker-compose.prod.yml` |
| `govfrota-api`, `govfrota-web`, `govfrota-db-init` | `infra/docker-compose.yml` |
| `govpro-api`, `govpro-web`, `govpro-portal`, `govpro-worker`, `govpro-beat` | `modulo-govpro/docker-compose.yml` |

**Para o GovTask use sempre `-f docker-compose.prod.yml`.** O `docker-compose.yml`
também define `govtask-api`, mas com CORS de `localhost`, `INTERNAL_API_KEY`
diferente e a rede `doe-network` em vez de `public` — subir por ele deixa o
módulo inacessível pela borda e faz o provisionamento de tenant falhar em
silêncio (o sintoma aparece depois como erro de chave estrangeira).

### Nunca use `--remove-orphans` aqui

Como os três arquivos compartilham o projeto `infra`, cada um considera **órfãos**
os serviços dos outros. Um `up -d --remove-orphans` com o `prod.yml` destrói os
oito containers do GovFrota e do GovPro. O próprio Compose sugere a flag na
mensagem de aviso; ignore a sugestão.

Vale o mesmo para `docker compose down`: ele para só o que o arquivo em uso
conhece, deixando o resto meio no ar.

## 2. Variáveis de ambiente

Definidas em `api/app/core/config.py`. Só as que importam operar:

### Obrigatórias em produção

| Variável | Para quê | Se errada |
|---|---|---|
| `POSTGRES_HOST/PORT/DB/USER/PASSWORD` | Conexão com o banco | A API não sobe |
| `SECRET_KEY` | Assina os tokens do próprio módulo | Sessões inválidas |
| `SAAS_JWT_SECRET` | **Valida o token do SSO da plataforma.** Tem de ser idêntico ao do `saas-platform` | Todo login responde 401 |
| `INTERNAL_API_KEY` | Autentica as chamadas internas de provisionamento de tenant | O tenant não sincroniza, e a falha aparece depois como erro de chave estrangeira |
| `CORS_ORIGINS` | Origens do frontend | O navegador bloqueia as chamadas |

`SECRET_KEY`, `SAAS_JWT_SECRET` e `INTERNAL_API_KEY` têm **valor padrão de
desenvolvimento** no compose. Publicar com o padrão é publicar com segredo
conhecido.

### Armazenamento de documentos

| Variável | Padrão | Observação |
|---|---|---|
| `STORAGE_BACKEND` | `local` | `local` grava em `STORAGE_LOCAL_PATH`; o compose monta o volume `govtask_uploads` |
| `STORAGE_LOCAL_PATH` / `UPLOAD_DIR` | `uploads` | **Precisa ser volume.** Sem volume, cada recriação de container apaga os documentos |
| `MINIO_ENDPOINT` / `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` / `MINIO_BUCKET` | — | Usados quando o backend não é local |
| `MAX_UPLOAD_SIZE_MB` | `50` | O tipo do arquivo é conferido pelos **bytes**, não pela extensão |

### Prazos, alertas e escalonamento

| Variável | Padrão | Observação |
|---|---|---|
| `DEADLINE_CHECK_ENABLED` | `true` | A varredura roda **in-process** |
| `DEADLINE_CHECK_INTERVAL_MINUTES` | `60` | Uma organização por vez |
| `NOTIFY_DEADLINE_DAYS` | `[7, 3, 1, 0]` | Marcos de aviso |

**Com mais de um worker uvicorn, cada worker roda a própria varredura.** Os
alertas são idempotentes por chave determinística (`tarefa:<id>:atrasada`), então
não duplicam, mas o trabalho é repetido. Com vários workers, prefira
`DEADLINE_CHECK_ENABLED=false` e dispare
`POST /api/govtask/admin/escalonamento/verificar` por um agendador externo.

O mesmo vale para as **recorrências de demanda**: o processamento é explícito
(`POST /recorrencias-demanda/processar`) até existir job periódico configurado.

## 3. Publicar uma versão

```bash
cd /home/ubuntu/sistemaweb/infra

# 1. Migrações — sempre antes de subir o código novo
docker compose -f docker-compose.prod.yml run --rm govtask-api alembic upgrade head

# 2. Build e subida (sem --deps, para não tocar em postgres/redis/nginx)
docker compose -f docker-compose.prod.yml up -d --build --no-deps govtask-api govtask-web

# 3. A borda precisa reler os endereços
docker exec infra-nginx-1 nginx -s reload

# 4. Conferir
curl -fsS http://localhost:8101/api/govtask/health
```

Use Compose v2 pelo usuário `ubuntu`, não por `sudo`. Antes de executar, um
`--dry-run` mostra o que seria recriado sem recriar nada.

**Nunca** `--remove-orphans` nem `git reset --hard` neste repositório: o primeiro
derruba serviços de outros módulos (ver acima), o segundo já causou perda de
arquivos que só existiam no disco. Produção roda `master`, o disco está em
`develop`; para trabalhar em duas versões ao mesmo tempo, use `git worktree`.

Se precisar injetar arquivos em um container em execução com `docker cp`,
restaure depois extraindo `/app` de um `docker create` da própria imagem — senão
o próximo restart sobe código novo contra banco antigo.

### A v2 foi aplicada em 17/09/2026

O banco `govtask` estava em `f7a1c2d3e4b5` (antes de `c0d1e2f3a4b5`, ou seja sem
a tabela `demandas`) e foi levado a `e8f9a0b1c2d3` — dez migrações de uma vez,
incluindo a conversão de convênio em demanda. Backup em
`backups/govtask-pre-v2-20260917_032944/` (dump custom + SQL + volume de uploads
+ a revisão anterior anotada).

Conversão conferida no banco real: 16 convênios → 16 demandas, 89 etapas, 11
tarefas e 96 eventos religados, 14 anexos com grupo de versão, 1 obra vinculada e
nenhuma órfã. Os convênios e os 9 usuários permaneceram intactos.

Para reverter, restaure o dump — **não** use `alembic downgrade` para desfazer a
cadeia inteira: as conversões de dados não são todas reversíveis, e o downgrade
de `e8f9a0b1c2d3` remove obras que só existirem sob uma demanda.

Antes de qualquer publicação futura desse porte, ensaie no ambiente alvo:

```bash
# Cópia do banco em uso, sem tocar no original
docker exec infra-postgres-1 psql -U "$PGUSER" -d postgres -c "CREATE DATABASE govtask_ensaio"
docker exec infra-postgres-1 sh -c "pg_dump -U $PGUSER govtask | psql -q -U $PGUSER -d govtask_ensaio"
# Migra a cópia com o código novo, confere, e só então vai para o banco real
```

### Migração desta entrega

`e8f9a0b1c2d3` cria as tabelas de comentário, checklist, financeiro gerencial e
visões salvas, adiciona `obras.demanda_id` e as duas colunas de busca.

Pontos que merecem atenção:

- **Requer as extensões `unaccent` e `pg_trgm`** e cria a configuração de busca
  `portugues_govtask`. `CREATE EXTENSION` precisa de privilégio adequado — em
  banco gerenciado onde o usuário da aplicação não tem esse direito, crie as
  extensões antes, manualmente, com um usuário que tenha.
- **`busca_tsv` e `busca_texto` são `GENERATED ALWAYS AS ... STORED`.** O
  PostgreSQL as mantém sozinho — não há trigger para alguém esquecer de recriar
  depois de um restore. Em bases grandes a criação reescreve a tabela `demandas`
  e toma um lock; rode em janela de manutenção.
- **O backfill de `obras.demanda_id`** correlaciona convênio e demanda pela
  timeline convertida na v2, e só age quando o convênio gerou **exatamente uma**
  demanda. Havendo ambiguidade a obra fica apenas no convênio, para um humano
  decidir. Vale conferir depois:

```sql
SELECT count(*) FROM obras WHERE demanda_id IS NULL AND deleted_at IS NULL;
```

O `downgrade` **remove** as obras que só existiam sob uma demanda: elas não têm
convênio para onde voltar. Faça dump antes.

## 4. Permissões

Catálogo em `api/app/core/permissions.py`. A autorização é sempre server-side; o
frontend decide apenas o que mostrar, nunca o que pode.

| Permissão | Dá acesso a |
|---|---|
| `resource.view` | Ler demandas no escopo permitido, comentar, operar as próprias tarefas, anexar na tarefa em que atua |
| `resource.create` | Abrir demanda, cadastrar autoridade |
| `resource.edit` | Editar demanda, status, bloqueio, tarefas, protocolos, checklists |
| `resource.delete` | Cancelar, excluir logicamente |
| `task.assign` / `task.approve` | Atribuir tarefa / concluir tarefa que exige aprovação |
| `financial.view` / `financial.manage` | Ler / lançar o financeiro da demanda |
| `engineering.manage` | Obras, cronograma, diário, fotos, vistorias |
| `licitacao.manage`, `accountability.manage` | Licitação, prestação de contas |
| `export` | CSV, relatório em PDF |
| `audit.view` | Auditoria; enxerga demandas sigilosas |
| `admin.config` | Catálogos, workflows, automações, modelos, ausências |

Roles com defaults em `ROLE_DEFAULT_PERMISSIONS`: `ADMIN`, `ASSESSOR`,
`PREFEITO`, `VICE_PREFEITO`, `CHEFE_GABINETE`, `SECRETARIO`, `DIRETOR`,
`CHEFE_DEPARTAMENTO`, `SERVIDOR`, `CONSULTA`, `AUDITOR`, `ENGENHEIRO_TECNICO`,
`COMPRAS_LICITACAO`, `GESTOR`.

O default é **fallback**: role sem linha em `role_permissions` cai nele. Uma role
provisionada pelo SaaS com nome fora desse mapa fica **sem permissão alguma** —
se alguém "não vê nada" depois de um provisionamento, comece por aqui.

### Sigilo e escopo

`services/demandas.aplicar_escopo` aplica o tenant incondicionalmente e o sigilo
(`RESTRITA`/`CONFIDENCIAL`) para quem não é envolvido. Acesso indevido responde
**404, nunca 403** — 403 confirmaria a existência do registro. Consolidações
(histórico da autoridade, busca, relatórios) usam o mesmo escopo, para que um
total não revele por aritmética o que a rota de detalhe recusa mostrar.

## 5. Backup e recuperação

Duas coisas precisam voltar juntas:

1. **Banco** `govtask` — entra no dump do PostgreSQL da plataforma.
2. **Documentos** — o volume `govtask_uploads` (ou o bucket MinIO). O banco
   guarda `storage_path` e o hash SHA-256; sem os arquivos, o download falha e a
   verificação de integridade não tem o que comparar.

Restaurar só o banco deixa o módulo aparentemente íntegro e com todos os
documentos inacessíveis.

Nada é apagado de verdade: exclusão é lógica (`deleted_at`), com motivo
obrigatório nas operações sensíveis, e a timeline é append-only.

## 6. Diagnóstico rápido

| Sintoma | Provável causa |
|---|---|
| 502 na borda depois de deploy | nginx não releu: `docker exec infra-nginx-1 nginx -s reload` |
| Todo login responde 401 | `SAAS_JWT_SECRET` diferente do `saas-platform` |
| Usuário novo "não vê nada" | Role sem linha em `role_permissions` e com nome fora de `ROLE_DEFAULT_PERMISSIONS` |
| Erro de chave estrangeira ao usar o módulo | Tenant não sincronizado: `INTERNAL_API_KEY` divergente |
| Busca lenta ou sem resultado esperado | Migração `e8f9a0b1c2d3` não aplicada: sem `busca_tsv`/`busca_texto` a consulta cai no `ILIKE` sem índice |
| Busca não acha palavra digitada sem acento | Configuração `portugues_govtask` ausente: `SELECT cfgname FROM pg_ts_config` |
| Documento some depois de recriar container | `uploads` sem volume montado |
| Alerta de prazo não chega | `DEADLINE_CHECK_ENABLED=false` sem agendador externo configurado |
| Demanda não conclui | Checklist obrigatório com item pendente é **impedimento**; `forcar` não contorna |

## 7. Testes

```bash
cd modulo-govtask/api
python3 -m pytest -q                       # SQLite em memória, isolado por teste
TEST_DATABASE_URL=postgresql+asyncpg://... python3 -m pytest -q   # contra PostgreSQL
```

A suíte cobre isolamento entre municípios (§165, com 13 portas diferentes),
permissões por role, máquinas de estado, prazos, uploads, workflow e os E2E do
§166 (veículo por indicação parlamentar) e §167 (obra pela Demanda).

O caminho full-text só existe no PostgreSQL: em SQLite a busca usa `ILIKE`
equivalente. Para exercitá-lo pela suíte, rode com `TEST_DATABASE_URL`. A busca
já foi validada manualmente contra PostgreSQL 16 (sem acento, plural, flexão
verbal, `OR`, exclusão com `-`, entrada suja e termo com `%`), mas isso não está
automatizado ainda.
