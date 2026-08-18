# Runbook — Rotação de segredos e limpeza do histórico Git

> Gerado pela auditoria de segurança (2026-08-17). Executar em **janela de manutenção**.
> Segredos novos já gerados fora do repositório em `NOVOS_SEGREDOS.env` (permissão 600,
> **não versionar**). Após aplicar, apagar esse arquivo e guardar em cofre (Vault/1Password/KeePass).

---

## STATUS DE EXECUÇÃO (atualizado 2026-08-17)

### ✅ Já executado e verificado ao vivo
- **Firewall** — exposição de Postgres/Redis/MinIO/APIs à internet fechada (`infra/harden-firewall.sh`), persistida.
- **saas-platform (plataforma central, isolada):**
  - Role **`saas_app` não-superuser** criado com grants (SELECT/INSERT/UPDATE/DELETE + sequences);
    a API foi migrada para ele (senha nova rotacionada). Confirmado: `super=f`, não consegue DROP.
  - `DEBUG=false`, `ENVIRONMENT=production` → `/docs`, `/redoc`, `/openapi.json` agora retornam **404**.
  - Rate-limit ativo em `login`(borda) + `forgot/reset/refresh` (5–10/min; 429 confirmado).
  - `.env` antigo salvo em `saas-platform/.env.audit-bak.*` (rollback).
- **Código (bind-mount, ativa no restart):** extração de tar segura no restore de backup
  (`apps/api` e `modulo-diario/api/.../backup.py`), gate de `/docs` em todos os módulos.
- **Git:** `infra/.env.backup` removido do índice; `opencode.json` teve a chave Context7 trocada por `${CONTEXT7_API_KEY}`.

### ⏳ Repositório com histórico já reescrito (PRONTO para push — ação sua)
Clone-espelho limpo gerado e verificado: **Gitleaks caiu de 95 → 12** (os 12 restantes são
fixtures de teste / exemplos de documentação, valores dummy). Removidos do histórico:
`infra/.env.backup.*`, todos os dumps `*govdoc-*-manual/database.json`, e a chave Context7.

Repo limpo (efêmero — regenere com os passos abaixo se sumir):
`…/scratchpad/audit/govsistem-clean.git`

**Para gerar você mesmo (recomendado, no seu ambiente):**
```bash
pip install git-filter-repo
git clone --mirror <URL-do-govsistem> govsistem-clean.git
cd govsistem-clean.git
printf 'ctx7sk-876974f8-ba8f-4314-b7af-959e1472a7a0==>${CONTEXT7_API_KEY}\n' > /tmp/repl.txt
git filter-repo --force --invert-paths \
  --path "infra/.env.backup.20260617_172108" \
  --path-glob "*govdoc-*-manual/database.json"
git filter-repo --force --replace-text /tmp/repl.txt
# verifique: docker run --rm -v "$PWD:/repo" zricethezav/gitleaks:latest detect --source=/repo --redact
```

**Push (IRREVERSÍVEL — coordene com quem tem clone; reescreve todos os SHAs):**
```bash
git remote add govsistem <URL-do-govsistem>
git push --force govsistem 'refs/heads/*:refs/heads/*'
git push --force --tags govsistem
```
Depois, **no servidor de produção**, reconcilie o checkout (ele terá história divergente):
```bash
cd /home/ubuntu/sistemaweb
git fetch govsistem
git reset --hard govsistem/master   # ou a branch em produção — confirme antes; guarde os .env!
```
> ⚠️ Os `.env` reais NÃO são versionados; `reset --hard` não os toca, mas confirme antes.
> **Rotacione a chave Context7** em context7.com (ela vazou e continua válida até rotacionar).

### 🔶 Pendente — rotação do cluster compartilhado (infra + govpro + govsocial)
Estes 3 stacks compartilham **um único role Postgres `doe_user`** (senha vazada `944f3d…`) no
mesmo `infra-postgres` e as **mesmas chaves MinIO** (vazadas). Rotacionar exige recriar ~13
containers de prefeituras juntos — por isso ficou para **janela de manutenção** (a exposição já
está fechada pelo firewall, então não é emergência). Procedimento na seção “Passo 1–3” abaixo,
com esta ordem específica para o cluster compartilhado:

```bash
# 1) senha nova do doe_user (mantém conexões vivas; novas exigem recriar apps)
NEW=$(openssl rand -base64 24 | tr -d '/+=' )
docker exec -it infra-postgres-1 psql -U doe_user -d doe -c "ALTER USER doe_user WITH PASSWORD '$NEW';"
# 2) atualizar POSTGRES_PASSWORD em infra/.env, modulo-govpro/.env, modulo-govsocial/.env  (o MESMO valor)
# 3) recriar os consumidores (verifique a saúde a cada um; reload nginx ao fim):
docker compose -f infra/docker-compose.prod.yml up -d --no-deps --force-recreate api worker beat signer govtask-api landing
docker compose -f modulo-govpro/docker-compose.yml up -d --no-deps --force-recreate api worker beat web portal
docker compose -f infra/docker-compose.govsocial.yml up -d --no-deps --force-recreate api web
docker exec infra-nginx-1 nginx -s reload
# rollback: reverter os .env e  ALTER USER doe_user WITH PASSWORD '<antigo>'  + recriar
```
> **Melhor ainda (fecha SEC-004 e SEC-005 de vez):** dar a cada stack seu **próprio role
> não-superuser** (como `saas_app`), em vez de manter o `doe_user` compartilhado. Repita o bloco
> de criação de role usado no saas-platform para `govpro`/`govsocial`/DB `doe`, com grants por DB.

### 🔶 Pendente — Redis com `requirepass` (infra-redis, saas-redis)
Firewall já fechou externamente. Para defesa em profundidade (recria Redis + clientes):
```bash
REDISPW=$(openssl rand -base64 24 | tr -d '/+=')
# compose do redis:  command: ["redis-server","--appendonly","yes","--requirepass","${REDIS_PASSWORD}"]
# .env dos clientes:  REDIS_PASSWORD=$REDISPW  e  REDIS_URL=redis://:$REDISPW@redis:6379/0
```
> Obs.: o `config.py` do saas monta `REDIS_URL` sem senha — inclua `REDIS_PASSWORD` na property
> antes de ativar (uma linha). Recrie Redis e TODOS os clientes na mesma janela.

### 🔶 Pendente — worker Celery da infra sem broker (disponibilidade, pré-existente)
`infra-worker-1` está em `infra_internal` e o `redis` em `infra_doe-network` — não se enxergam
desde 2026-08-04. Conecte os dois na mesma rede no compose (ou aponte `REDIS_URL` para o host certo).

---

## Por que (achados)

- **SEC-003 (CRÍTICO):** `infra/.env.backup.20260617_172108` estava versionado e continha
  `POSTGRES_PASSWORD`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY` **idênticos aos de produção**.
  Já removido do índice (`git rm --cached`). Ainda presente no **histórico** — vide passo 4.
- **SEC-004 (CRÍTICO):** `INTERNAL_API_KEY` reutilizada por 6 módulos; `SECRET_KEY`
  compartilhado entre saas-platform e diário; senha do Postgres/MinIO reutilizada em
  infra/govpro/govsocial. Comprometer um serviço compromete todos.
- **Gitleaks:** 95 secrets no histórico (inclui dumps `govdoc/.runtime/*/database.json`,
  1 token Stripe, headers `curl`).

## Princípios

1. **Cada serviço com segredo próprio** — nunca reutilizar `SECRET_KEY`/senha entre módulos.
2. Rotacionar **tudo** que já esteve no Git (assumir vazado).
3. Após rotação, reescrever o histórico para remover os segredos antigos.

## Passo 1 — Aplicar as novas senhas de banco (Postgres)

Para cada banco (saas, diário, infra, govpro, govsocial, govdoc, govinfra, govcompras):

```bash
# Ex.: saas-platform
NEW=<POSTGRES_PASSWORD_saas de NOVOS_SEGREDOS.env>
docker exec -it saas-platform-postgres-1 psql -U saas_user -d saas_platform \
  -c "ALTER USER saas_user WITH PASSWORD '$NEW';"
# Atualizar o .env do serviço e recriar api/worker/beat:
#   POSTGRES_PASSWORD=$NEW  em saas-platform/.env
docker compose -f saas-platform/docker-compose.yml up -d --force-recreate api web-admin
```

Repetir por módulo. **Ordem:** altere a senha no Postgres → atualize `.env` → recrie os
serviços que conectam (api, worker, beat). Recriar deixa a borda em 502 até
`docker exec infra-nginx-1 nginx -s reload` (ver runbook de deploy).

## Passo 2 — Redis com senha (`requirepass`)

O firewall já fechou o Redis para a internet (SEC-001/002), mas defina senha como
defesa em profundidade:

```bash
# infra/.env  e  saas-platform/.env
REDIS_PASSWORD=<REDIS_PASSWORD_infra / _saas>
REDIS_URL=redis://:<senha>@redis:6379/0
```

No compose do Redis, subir com `--requirepass`:

```yaml
redis:
  image: redis:7-alpine
  command: ["redis-server", "--requirepass", "${REDIS_PASSWORD}"]
```

Recriar Redis **e todos os clientes** (api/worker/beat/chatgov) na mesma janela —
cliente sem a senha falha ao conectar.

## Passo 3 — Rotacionar SECRET_KEY / INTERNAL_API_KEY / JWT / MinIO

- `SECRET_KEY` de cada módulo → valor **próprio** de `NOVOS_SEGREDOS.env`.
  Efeito colateral: **invalida todos os JWT/sessões ativos** (usuários relogam). Fazer
  em janela de baixo uso.
- `INTERNAL_API_KEY`: idealmente **uma por par SaaS↔módulo**. No mínimo, gerar nova e
  atualizar em todos os `.env` simultaneamente (o sync SaaS→módulo usa ela).
- `chatgov` `JWT_SECRET` (estava com 18 chars, entropia baixa) → novo de 48.
- MinIO `MINIO_ROOT_PASSWORD`/`MINIO_SECRET_KEY` → novos; recriar MinIO e serviços que
  usam storage; reconfigurar clientes (`mc alias set`).

## Passo 4 — Limpar o histórico do Git

Assumir que **tudo que já esteve no Git vazou** (por isso o passo 1–3 primeiro). Depois:

```bash
pip install git-filter-repo
# Remover arquivos sensíveis de TODO o histórico:
git filter-repo --force \
  --path infra/.env.backup.20260617_172108 --invert-paths \
  --path-glob 'modulo-govdoc/api/.runtime/*/database.json' --invert-paths \
  --path-glob 'modulo-*/.env' --invert-paths

# Reescreve SHAs → coordenar com todos que têm clone.
git remote add origin <url>   # filter-repo remove o remote
git push --force --all
git push --force --tags
```

Alternativa por conteúdo (BFG): `bfg --delete-files '.env.backup*'`.

> **Importante:** reescrever histórico muda todos os SHAs; alinhar com o time e refazer
> clones. Mesmo assim, considere os segredos antigos comprometidos permanentemente —
> a rotação (passos 1–3) é o que de fato protege.

## Passo 5 — Verificação

```bash
# Nenhum secret rastreado:
docker run --rm -v "$PWD:/repo" zricethezav/gitleaks:latest detect \
  --source=/repo --no-git --redact         # tree atual → 0
# Serviços de pé e borda 200:
curl -sk -o /dev/null -w '%{http_code}\n' https://govsistem.com.br/
docker exec infra-nginx-1 nginx -s reload
```

## Checklist

- [ ] Senhas Postgres rotacionadas (8 bancos) + serviços recriados
- [ ] Redis com `requirepass` + clientes atualizados
- [ ] `SECRET_KEY` própria por módulo
- [ ] `INTERNAL_API_KEY` nova distribuída a todos os módulos
- [ ] `JWT_SECRET` do chatgov (48+ chars)
- [ ] MinIO root/secret rotacionados
- [ ] Histórico reescrito (git-filter-repo) e push --force coordenado
- [ ] Gitleaks tree = 0; borda 200; `nginx -s reload`
- [ ] `NOVOS_SEGREDOS.env` movido para o cofre e apagado do disco
