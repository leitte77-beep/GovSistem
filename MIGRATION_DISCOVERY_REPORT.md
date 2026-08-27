# MIGRATION_DISCOVERY_REPORT — GovSistem Multi-Tenant

> Gerado: 2026-08-27 — Branch `deploy-govtask` @ `847661ec7273b2ec31b6ff056d5132c5acfb7d2d`
> Fonte da verdade: **código do workspace** + `saas-platform/SCHEMA_ROLES.md` (gerado a partir do banco `saas_platform` de produção em 2026-08-27).
> Status do banco: **acesso obtido** (localhost:9432, superuser `saas_user`). Migration `mt0001_add_memberships` e backfill **aplicados**; integridade validada (`DATA_INTEGRITY_VALIDATION.md`). Contagens reais nas seções 9/10.

---

## 1. Estrutura geral do workspace

Monorepo com a plataforma SaaS central, a infraestrutura e os módulos (cada um é uma app independente):

| Área | Caminho | Stack |
|------|---------|-------|
| **Plataforma SaaS (backend)** | `saas-platform/api` | Python 3, FastAPI, SQLAlchemy 2 async, Alembic, PostgreSQL, Redis, httpx |
| **Plataforma SaaS (frontend/admin)** | `saas-platform/web-admin` | Next.js (App Router), Tailwind |
| **Orquestração SaaS** | `saas-platform/docker-compose.yml` | postgres:16, redis:7, api, web-admin |
| **Infra (nginx/reverser)** | `infra/` | nginx, docker-compose.prod/staging |
| **Módulos** | `modulo-chatgov`, `modulo-diario`, `modulo-govavalia`, `modulo-govcompras`, `modulo-govdoc`, `modulo-govfrota`, `modulo-govinfra`, `modulo-govpro`, `modulo-govsocial`, `modulo-govtask` | stacks variadas (FastAPI + Next; diario = web-admin/web-public/signer) |
| **Portal (protótipo)** | `Portal/` | estrutura inicial (a avaliar) |
| **Docs/scripts** | `docs/`, `scripts/`, `modelos/` | |

Outros: `apps/` (apps históricas da plataforma doe), `backup-prod/`, `backups/`, `uploads/`, `xxx/`.

---

## 2. Banco de dados

- **Engine:** PostgreSQL 16 (container `postgres:16-alpine`, porta host `9432` → interno `5432`).
- **Banco:** `saas_platform`; **usuário configurado:** `saas_app` (`.env` do `saas-platform`). `.env` **não define** `POSTGRES_PASSWORD` nem `POSTGRES_HOST` — recaem nos defaults do `config.py` (`localhost`, senha vazia).
- **ORM:** SQLAlchemy 2.0 async (`asyncpg`); **migrações:** Alembic (diretório `saas-platform/api/alembic/versions`).
- **Acessibilidade verificada neste ambiente:**
  - TCP localhost:5432 → aberto.
  - Autenticação `saas_app` → **falhou** (`InvalidPasswordError: password authentication failed for user "saas_app"`).
  - **Conclusão: NÃO há credenciais válidas para gerar o dump. Esta é uma condição de parada (seção 30 do briefing).** Nenhuma migration/backfill foi aplicada; nenhum dado foi lido/alterado.

### Tabelas relevantes (confirmadas no código)

| Tabela | Modelo | Papel |
|--------|--------|-------|
| `users` | `models/user.py` | Identidade central; `organization_id` (único), `platform_role`, `is_platform_admin`, `is_organization_admin`, `module_permissions` (JSON legado), `force_password_reset`, `mfa_*`, `password_hash`, soft-delete |
| `organizations` | `models/organization.py` | Tenants atuais; `slug`, `is_active`, `theme_config`, `public_url`, soft-delete |
| `modules` | `models/module.py` | Catálogo de módulos; `base_url`, `api_url`, `admin_url`, `public_url`, `is_active`, `version` |
| `organization_modules` | `models/organization_module.py` | Vínculo tenant↔módulo contratado; `is_active`, `expires_at` |
| `user_module_grants` | `models/user_module_grant.py` | Grant canônico (usuario↔módulo↔role); `uq_user_module_role` |
| `sso_sessions` | `models/sso_session.py` | Sessão SSO usada na emissão de token de módulo |
| `feature_flags` | `models/feature_flag.py` | Flags; `key`, `enabled`, `company_id` |
| `audit_events` | `models/audit_event.py` | Auditoria; `actor_id`, `organization_id`, `action`, `details` |
| demais (`plan`, `subscription`, `invoice`, etc.) | — | Financeiro/contabilidade da plataforma |

**Não existe** `organization_memberships` nem `membership_module_grants` hoje — serão criados (aditivos).

---

## 3. Autenticação (fluxo atual)

- **Credenciais:** bcrypt (`hash_password`/`verify_password`), em `users.password_hash`. Validação de força mínima; bloqueio por tentativas (`locked_until`), `force_password_reset`.
- **Tokens:** JWT HS256 (`core/security.py`).
  - *Access*: `{ sub, roles[], organization_id, is_platform_admin, type:"access", iat, exp }`.
  - *Refresh*: `{ sub, jti, type:"refresh", ... }`.
  - *Module (SSO)*: `{ sub, organization_id, roles[], module, type:"module_access", iss:"govsistem", iat, exp }`.
- **Login** (`POST /auth/login`): valida senha, monta `roles` a partir de `platform_role` + `is_platform_admin`(→`PLATFORM_ADMIN`) + `is_organization_admin`(→`ADMIN`) + `organization_id`(→`ORG_MEMBER`). Gera access+refresh, grava audit `login`.
- **Quem acessa o painel SaaS:** `get_current_platform_admin` exige `is_platform_admin OR platform_role=="SUPER_ADMIN"` (`core/auth.py:99`). **Atenção:** hoje a maioria dos usuários municipais tem `platform_role=SUPPORT`, que **não** passa por essa checagem — mas `is_organization_admin=true` **também não** concede acesso ao painel. Ou seja, SUPPORT não abre o painel central sozinho.

> Nota de compatibilidade: a montagem de `roles` inclui `ORG_MEMBER` globalmente e injeta o nome da role de plataforma (ex.: `SUPPORT`) no token **de todos os módulos**, além das roles de módulo. Isso será corrigido no modelo multi-tenant (claims por módulo), com fallback.

## 4. SSO (fluxo atual)

`POST /auth/module-access`:
1. Valida módulo ativo e `organization_modules` ativo para o tenant do usuário.
2. Monta `roles` (platform + `ADMIN`/`ORG_MEMBER` + roles de `user_module_grants` normalizadas).
3. Cria `SsoSession` (user, org, module_slug, token_jti, redirect_url, expires_at).
4. Grava audit `module_access`.
5. Sincroniza usuário/org ao módulo via `internal/sync-user` e `internal/sync-organization` (X-Internal-Key), com `roles` (todas as roles mescladas).
6. Gera **module_token** (JWT de módulo) e devolve `{ module_token, module_url, expires_in }` ao frontend.

**Fragilidades identificadas:**
- O `module_token` carrega `roles` como **lista global sem namespace** (todas as roles de todos os módulos do usuário), embora o payload tenha `module`. Um módulo recebe roles de outros módulos.
- `_sync_user_to_modules` (users.py) envia o mesmo conjunto mesclado a **todos** os módulos do usuário.
- A URL do módulo é resolvida em código (muitos `if/elif`) a partir de `module.admin_url`/`base_url` e variáveis `*_MODULE_ADMIN_URL` — sem validação de conflito entre banco e `.env` (ex.: diario, govpro/proc).

## 5. Roles

- **Plataforma** (`PlatformRole`): `SUPER_ADMIN`, `PLATFORM_ADMIN`, `BILLING_MANAGER`, `SUPPORT`, `AUDITOR` (vive em `users.platform_role`).
- **Flags:** `is_platform_admin`, `is_organization_admin`.
- **Módulo** (`MODULE_ROLE_CATALOG` em `core/roles.py`): 10 módulos, roles por módulo (ex.: diario→AUTOR..DIARIO_ADMIN; govpro→ADMIN..AUTORIDADE_SIGNATARIA; govfrota→ADMIN..AUDITOR). Roles com mesmo nome em módulos distintos são independentes (validadas por `module_slug`).
- **Legacy map** (`LEGACY_ROLE_MAP`): `ADMIN`→`DIARIO_ADMIN`/`GOVTASK_ADMIN`/`GOVSOCIAL_ADMIN`/`admin_geral`, `AUDITOR`→`auditor`.
- **Legado:** `users.module_permissions` (`{"modules": [...]}`) — só lista módulos, sem role. É derivado dos grants no cadastro novo (PUT), mas usuários antigos podem ter acesso só por ele.

## 6. Módulos e URLs

Resolvido de `.env` do `saas-platform` (não-secreto) e `infra/nginx/sites/default.conf`:

| Módulo | `.env ADMIN_URL` | `.env INTERNAL_URL` | nginx server_name/proxy |
|--------|------------------|---------------------|-------------------------|
| chatgov | chatgov.govsistem.com.br | http://host.docker.internal:3050/api | chatgov.govsistem.com.br → :3050 |
| diario | diario.govsistem.com.br | http://host.docker.internal:9201/api/v1 | *(não listado no default.conf)* |
| financeiro | — | — | sem domínio |
| govavalia | govavalia.govsistem.com.br | http://host.docker.internal:4100 | *(não listado)* |
| govdoc | govdoc.govsistem.com.br | https://govdoc.govsistem.com.br/api/govdoc | govdoc.govsistem.com.br → :43000 |
| govfrota | frota.govsistem.com.br | http://host.docker.internal:8301/api/govfrota | frota.govsistem.com.br → govfrota |
| govouve | — | — | *(não listado)* |
| govpro | govpro.govsistem.com.br | http://host.docker.internal:8203/api/govpro/v1 | *(não listado no default.conf)* |
| govsocial | govsocial.govsistem.com.br | http://host.docker.internal:8202/api/govsocial/v1 | govsocial.govsistem.com.br → :8202 |
| govtask | govtask.govsistem.com.br | http://host.docker.internal:8101/api/govtask | govtask.govsistem.com.br → govtask |

`infra/nginx/sites/default.conf` (server_name consolidado): `govsistem.com.br admin.govsistem.com.br api.govsistem.com.br chatgov.govsistem.com.br govsocial.govsistem.com.br govtask.govsistem.com.br govdoc.govsistem.com.br frota.govsistem.com.br`.

**Conflitos conhecidos (a resolver fora do código, em infra/DNS):**
- `diario`: `.env` → `diario.govsistem.com.br`; **documentação do prompt** cita `doe-admin.govsistem.com.br` como admin. O `.env` histórico `CORS_ORIGINS` do docker-compose inclui `https://doe-admin.govsistem.com.br`. **Não há acesso a DNS/cert/proxy** deste ambiente para decidir qual é o canônico → marcado como pendência externa (ver `MODULE_URL_AUDIT.md`).
- `govpro`: `.env ADMIN_URL` → `govpro.govsistem.com.br`; prompt cita `proc.govsistem.com.br` via `PUBLIC_URL`. **Não verificado externamente.**

`financeiro`: sem domínio público — **preservado interno** (nenhum tenant usa; só órgão Admin).

## 7. Git

- Branch atual: `deploy-govtask`; head `847661ec7273b2ec31b6ff056d5132c5acfb7d2d` (4 commits à frente de `govsistem/deploy-govtask`).
- Diversos arquivos modificados/não rastreados (majoritariamente `modulo-govfrota` e `saas-platform/api/app/core/roles.py`; `SCHEMA_ROLES.md` não rastreado).
- Remotes: `govsistem` e `origin`. Há branchs de feature (`feature/saas-platform`, `feat/admin-login-paginas-legais`, etc.).
- Migrations Alembic com **heads múltiplos** (histórico divergente — ex.: `20260525_*`, `d5e6f7a8b9c0`, `govsocial01`, e ramos `r1s2t3u4v5w6`/`k2l3m4n5o6p7`). O head aplicado em produção **só é conhecido via `alembic_version`** (inacessível sem credenciais). → condição de atenção para aplicação de novas migrations.

## 8. Backups existentes / volumes

- `backup-prod/`, `backups/`, `.env.*.bak-*` presentes — já existem backups manuais anteriores.
- Volumes docker: `saas_pgdata`, `saas_redisdata`, e demais por módulo. Uploads em `uploads/` e `saas-platform/api/uploads/`.

---

## 9. Contagens (confirmadas no banco — 2026-08-27)

- Usuários: **43** (42 ativos, 1 inativo). 42 com organização; **1 sem** (`contato@govsistem.com.br`, interno).
- Organizações: **6** (4 ativas: Admin, farol, social, saude; 2 inativas: camara, prefeitura-teste).
- Módulos: **10**. Vínculos tenant/módulo (`organization_modules`): **24**.
- Grants legados (`user_module_grants`): **72**. Gestores (`is_organization_admin`): **4**.
- **Novo (aplicado):** memberships=**42** (4 ORG_ADMIN, 41 ativos); grants de membership=**106** (72 MIGRATED_GRANT + 34 MIGRATED_LEGACY, sendo 33 `requires_review`).
- Head Alembic real: `govpro01` (sem arquivo no branch → criado stub `govpro01_stub.py`).

---

## 10. Inconsistências / riscos / dependências

| Tipo | Item | Risco |
|------|------|-------|
| Dados | Usuários com acesso **somente** via `module_permissions` legado | Perda de acesso se novo modelo ignorar o legado → **fallback obrigatório** |
| Dados | Usuário inativo (`Felipe Franciscato`, `is_active=false`) com grant CHATGOV_USER | Sem impacto (bloqueio global respeitado), mas mantido para auditoria |
| Roles | `SUPPORT` em muitos usuários municipais | Não abre o painel hoje; pode confundir futura separação → revisão (seção 11) |
| Roles | Roles homônimas entre módulos (ADMIN/AUDITOR) | Já isoladas por `module_slug`; manter isolamento no novo grant |
| Migrations | Histórico Alembic com **heads múltiplos** | Aplicar nova migration exige conhecer o head real (`alembic_version`) |
| URLs | Conflitos diario/doe-admin e govpro/proc | Não resolvível sem infra/DNS; manter aliases; separar campos |
| Segurança | Token de módulo com `roles` global não-namespaced | Mistura de permissões entre módulos → corrigir com claims por módulo |
| Segurança | CORS lista explícita (sem `*`) | OK; adicionar `app`/`auth` quando forem publicados |
| Dependência | **Sem credenciais de banco** | **BLOQUEIA** dump, migração e backfill → condição de parada |

## 11. Usuários municipais com role de plataforma (levantamento → `PLATFORM_ROLE_REVIEW.md`)

Baseado em `SCHEMA_ROLES.md`. Usuários com `platform_role=SUPPORT` que **não** são contas internas (`is_platform_admin=false`, fora da org `admin`) e não devem receber acesso ao painel central `admin.govsistem.com.br`:
- Farol: Alessandr Jach, Alisson Leite(⚠ org-admin), ELIEL CROISFELT, Gabriel Lima, Joelma Cruz, João Marcos, João Ricardo, Pamela Costa.
- Saúde: Leite Admin (⚠ org-admin `alisson_leitte@hotmail.com.br`).
- Social: Admin Teste(⚠ org-admin), Ana Paula Mello, Eliane Amélia, Gislaine Lima, Maria Terezinha, Priscila Vanessa, Sthefany Victoria, Tania Aparecida.

**Condição interna inequívoca para `admin.govsistem.com.br`** (implementada no backend): `SUPER_ADMIN` OU `is_platform_admin=true` OU membership `ORG_ADMIN` na organização interna da plataforma (`slug='admin'`). A label `SUPPORT` **não** concede acesso ao painel central.

## 12. Estratégia de migração

**Aditiva e reversível**, com feature flags desligadas por padrão:
1. Criar `organization_memberships` e `membership_module_grants` (novas tabelas; nada removido).
2. Backfill idempotente (dry-run primeiro): memberships a partir de `users.organization_id`; grants a partir de `user_module_grants` (`source=MIGRATED_GRANT`) e acessos legados determinísticos (`source=MIGRATED_LEGACY`, `requires_review` quando sem mapeamento seguro).
3. Backend: contexto de tenant via membership; claims novas (namespaced por módulo) mantendo claims antigas; flag `NEW_SSO_CLAIMS_ENABLED`/`LEGACY_SSO_CLAIMS_ENABLED`.
4. Leituras do novo modelo com **fallback seguro** para o legado (`LEGACY_MODULE_PERMISSIONS_FALLBACK`).
5. Novos endpoints `/tenant/*` (sem tocar `/users`/`/organizations` atuais).
6. Portal `app.govsistem.com.br` (novo frontend), separação do painel SaaS por flag `PLATFORM_USERS_SEPARATION_ENABLED`.

## 13. Estratégia de rollback

Ver `ROLLBACK_PLAN.md`. Princípio: desligar flags → restaurar app anterior → manter tabelas novas inativas → reativar fluxo antigo; **não** restaurar banco de produção automaticamente.

---

## 14. Status / próximos passos

1. ~~Fornecer credenciais de banco~~ **resolvido** — dump gerado/validado; migration `mt0001_add_memberships` + backfill aplicados; integridade validada.
2. Definir domínios canônicos (diario, govpro/proc) e publicar `app`/`auth.govsistem.com.br` com DNS/cert/proxy.
3. **Ativação gradual por feature flag em homologação** (piloto: Farol): `MEMBERSHIP_AUTH_V2_ENABLED` → `MEMBERSHIP_GRANTS_V2_ENABLED` → `TENANT_PORTAL_ENABLED` → `NEW_SSO_CLAIMS_ENABLED` → `PLATFORM_USERS_SEPARATION_ENABLED`.

> Este relatório documenta a descoberta. A implementação aditiva (models, migrations, backfill, APIs, portal) está entregue; **migration e backfill foram aplicados em produção de forma aditiva e reversível** (nenhum dado removido/alterado destrutivamente).
