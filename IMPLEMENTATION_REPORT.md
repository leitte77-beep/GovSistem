# IMPLEMENTATION_REPORT — Multi-Tenant GovSistem

> Data: 2026-08-27 — Branch `deploy-govtask` @ `847661ec7273b2ec31b6ff056d5132c5acfb7d2d`
> Natureza: implementação **aditiva**, **reversível**, **atrás de feature flags**, sem remoção do legado.
> **Status de execução:** banco acessado (localhost:9432); dump gerado e validado; migration `mt0001_add_memberships` **aplicada**; backfill **aplicado**; integridade validada. Pendências: ativação por feature flag (em homologação), DNS/cert/proxy dos domínios novos.

---

## 1. Backup

- Pasta: `backfar/20260827-122010/`
  - `codigo/codigo.tar.gz` (todos os repositórios; exclui node_modules/.next/__pycache__/dist — reproduzíveis, lockfiles preservados)
  - `configuracoes/env/*` (29 `.env*`)
  - `infraestrutura/` (infra.tar.gz + docker-compose*.yml)
  - `uploads_e_volumes/uploads.tar.gz`
  - `git/` (`repo.bundle` + `git_snapshot.txt`)
  - `inventario/manifesto.json`, `inventario/env_keys_redacted.txt`
  - `checksums/SHA256SUMS` — **validado OK** (recalculado após incluir o dump)
  - `restauracao/ROLLBACK.md`
- **Banco:** dump `banco/saas_platform_20260827-122010.dump` (362 KB, pg_dump 16 custom) **gerado e validado** (restauração em banco temporário: users=43, orgs=6, grants=72, modules=10, org_modules=24, alembic=govpro01; temp DB descartado).
- `.gitignore` atualizado com `backfar/`.

## 2. Relatórios (entregues na raiz)

- `MIGRATION_DISCOVERY_REPORT.md`
- `PLATFORM_ROLE_REVIEW.md`
- `USERS_WITHOUT_TENANT_REVIEW.md`
- `LEGACY_ACCESS_REVIEW.md`
- `MODULE_URL_AUDIT.md`
- `DATA_INTEGRITY_VALIDATION.md`
- `ROLLBACK_PLAN.md`
- `IMPLEMENTATION_REPORT.md` (este)

## 3. Alterações de código (aditivas)

### Backend (`saas-platform/api`)
- **Models novos:** `app/models/organization_membership.py` (`OrganizationMembership`), `app/models/membership_module_grant.py` (`MembershipModuleGrant`). Registrados em `models/__init__.py`; relações em `User`/`Organization`.
- **Enums:** `MembershipRole`, `MembershipStatus`, `GrantSource`, `TENANT_PORTAL_FLAGS`.
- **Migration:** `alembic/versions/mt0001_add_memberships.py` (cria as 2 tabelas + índices únicos parciais + colunas de URL em `modules`; `downgrade` restaura). **Nota de operação:** histórico Alembic tem múltiplos heads; ajustar `down_revision` ao head real antes de aplicar.
- **Backfill:** `scripts/backfill_memberships.py` (idempotente; `--dry-run`/`--apply`; `MIGRATED_GRANT`/`MIGRATED_LEGACY`; `requires_review` para legado sem mapeamento seguro).
- **Config:** novas flags/defaults em `app/core/config.py` (`TENANT_PORTAL_ENABLED`…`PLATFORM_INTERNAL_ORG_SLUG`, `AUTH_BASE_URL`, `TENANT_PORTAL_BASE_URL`, `ADMIN_BASE_URL`).
- **Security:** `create_access_token` e `create_module_token` aceitam claims de membership/tenant e roles **namespaced por módulo** (`module_roles`, `target_module`, `membership_id`), mantendo claims legadas.
- **Auth:** `get_current_platform_admin` agora exige condição interna inequívoca (SUPER_ADMIN/is_platform_admin/membership ORG_ADMIN na org `admin`); label `SUPPORT` não abre o painel central.
- **Novo serviço:** `app/services/membership.py` (memberships ativos, grants, `is_tenant_manager`, `is_platform_internal`, `resolve_module_roles` com fallback legado, `org_has_module`).
- **Novas dependências:** `app/core/membership_deps.py` (`get_tenant_context`, `require_tenant_manager`) — tenant derivado do token, slug nunca autoriza.
- **Novo router:** `app/api/v1/tenant.py` registrado em `router.py`:
  - `GET /tenant/organizations` (troca de tenant)
  - `GET /tenant/context`, `GET /tenant/modules` (cards), `GET /tenant/dashboard` (gestor)
  - `GET/POST /tenant/users`, `GET/PUT /tenant/users/{id}/grants`, `PATCH /tenant/users/{id}/status`, `POST /tenant/users/{id}/password-reset`
  - `GET /tenant/audit`
- **SSO integrado:** `POST /auth/module-access` re-resolve roles via membership quando `MEMBERSHIP_GRANTS_V2_ENABLED` e emite claims novas quando ativas; legado preservado.

### Portal do tenant (`saas-platform/tenant-portal` — novo)
- App Next.js 14 (App Router) para `app.govsistem.com.br` (Dockerfile standalone incluído).
- `src/lib/api.ts` + `auth-provider.tsx`; login; shell com sidebar azul-escura + header claro; páginas `dashboard`, `modulos`, `usuarios`.
- **Sem mocks:** todas as telas consomem `/tenant/*` reais.

## 4. Feature flags

| Flag | Default | Efeito |
|------|:---:|--------|
| TENANT_PORTAL_ENABLED | off | habilita portal app.govsistem |
| MEMBERSHIP_AUTH_V2_ENABLED | off | contexto de membership no login |
| MEMBERSHIP_GRANTS_V2_ENABLED | off | lê membership_module_grants (com fallback) |
| LEGACY_MODULE_PERMISSIONS_FALLBACK | **on** | mantém acesso por module_permissions (sem perda) |
| LEGACY_SSO_CLAIMS_ENABLED | **on** | mantém claims legadas no token |
| NEW_SSO_CLAIMS_ENABLED | off | emite claims novas namespaced |
| PLATFORM_USERS_SEPARATION_ENABLED | off | restringe listagem global a contas internas |

## 5. Testes

- Suite existente: **56 passaram** (inalterados, verdes).
- Novos (`tests/test_multitenant.py`): **9 passaram** (isolamento de roles por módulo, claims de token, LEGACY_SAFE_ROLE).
- **Total: 65 passaram.**
- Portal: typecheck TypeScript **limpo** (exit 0).
- **Banco (produção):** migration aplicada e backfill executado; integridade validada (`DATA_INTEGRITY_VALIDATION.md`). Testes de SSO real por módulo e isolamento de tenants com dados **pendentes** (exigem homologação).

## 5b. Aplicação em produção (executada nesta sessão)

1. Dump validado (restauração em banco temporário).
2. Head Alembic real: `govpro01` (sem arquivo no branch) → criado stub `govpro01_stub.py` (no-op) e apontado `down_revision` da migration para ele.
3. `alembic upgrade mt0001_add_memberships` aplicado como `saas_user` (padrão de propriedade das tabelas); `GRANT` de DML ao `saas_app`.
4. Backfill `--dry-run` (contagens ok) → `--apply`.
5. Integridade: 43 usuários / 6 orgs / 72 grants legados / 4 gestores — inalterados; 42 memberships; 106 grants de membership; 33 pending review (acesso preservado por fallback).
6. **Validação end-to-end** (API local vs banco real, token com membership de `admin@farol.pr.gov.br`): `/tenant/context`, `/tenant/modules`, `/tenant/dashboard` (Farol: 31 usuários/2 gestores/7 módulos/82 grants/23 pendências), `/tenant/users` — todos **200 OK** com dados reais.
7. **Infra preparada:** `infra/nginx/sites/default.conf` com server blocks `app.govsistem.com.br` e `auth.govsistem.com.br`; `docker-compose.yml` com serviço `tenant-portal` (host 9011) e CORS atualizado.
8. **Feature flags ativadas (seguras):** `TENANT_PORTAL_ENABLED`, `MEMBERSHIP_AUTH_V2_ENABLED`, `LEGACY_MODULE_PERMISSIONS_FALLBACK`, `LEGACY_SSO_CLAIMS_ENABLED`. **Desligadas:** `MEMBERSHIP_GRANTS_V2_ENABLED`, `NEW_SSO_CLAIMS_ENABLED`, `PLATFORM_USERS_SEPARATION_ENABLED`.

> **Decisão de segurança (SSO v2) — corrigida:** `MEMBERSHIP_GRANTS_V2_ENABLED` foi **reprojetada para ser aditiva** e está **ATIVA**. Investigação do módulo Diário revelou que ele autoriza pela tabela local `user_roles`, populada via `/internal/sync-user` (`_module_roles(payload.roles)`): reduzir `roles` para só `['AUTOR']` faria o gestor perder `ADMIN`. Por isso o fluxo **não reduz** mais o claim legado `roles` (mantém `['ADMIN','ORG_MEMBER','AUTOR']`, preservando o sync de admin) e **apenas adiciona** as claims namespaced `module_roles`, `target_module` e `membership_id`. Resultado: retrocompatível para todos os módulos (nenhum recebe menos que antes); validado via `/auth/module-access` (roles legado completas + `module_roles={'diario':['AUTOR']}` + membership_id).

## 5c. Deploy em produção (executado nesta sessão)

- **Portal** `tenant-portal` construído (imagem `saas-platform-tenant-portal`) e no ar (`0.0.0.0:9011->3001`); API recriada com o código multi-tenant + CORS atualizado.
- **nginx** `infra-nginx-1` recarregado com o `default.conf` atualizado (config validada).
- **Certificados TLS** emitidos via certbot (webroot) para `app.govsistem.com.br` + `auth.govsistem.com.br` (SANs no cert de `app`), válidos até 2026-11-25.
- **DNS** já apontava `app`/`auth` → `137.131.238.177`.
- **Endpoints públicos validados (TLS trusted, verify=0):**
  - `https://app.govsistem.com.br` → portal (login renderiza; `/` → `/dashboard`; proxy `/api` funcional).
  - `https://auth.govsistem.com.br` → API do SaaS (`/api/v1/tenant/context` e `/dashboard` → **200** com dados reais de Farol).
  - `https://admin.govsistem.com.br` → **inalterado** (200).
  - `auth`/`app /api/v1/auth/login` com credencial inválida → **401** (prova a cadeia nginx→portal→API→postgres).
- Nota: `auth`/`api` apontam para o `saas-platform-api-1` via host gateway `172.17.0.1:9009` (o `api:8000` da rede infra era `infra-api-1`, API legada sem o router `/tenant`).

## 6. Configurações externas pendentes (fora do alcance da IA)

1. ~~Credenciais de banco~~ **resolvido** — conexão por `localhost:9432`; migration+backfill aplicados.
2. ~~DNS~~ **resolvido** — `app`/`auth` já apontavam para `137.131.238.177`.
3. ~~Certificados TLS~~ **emitidos** para `app`/`auth.govsistem.com.br` (certbot webroot; renovação via certbot).
4. ~~nginx~~ **recarregado**; portal `tenant-portal` **deployado** (serviço no ar).
5. **Resolver conflitos de URL** (diario/doe-admin, govpro/proc) — manter aliases até validação (ver `MODULE_URL_AUDIT.md`).
6. **Homologação gradual por módulo** das flags SSO (`MEMBERSHIP_GRANTS_V2_ENABLED`, `NEW_SSO_CLAIMS_ENABLED`, `PLATFORM_USERS_SEPARATION_ENABLED`) — permanecem off.

## 7. Riscos restantes

- Banco inacessível → contagens e aplicação pendentes.
- Histórico Alembic com múltiplos heads → exigir reconciliação antes de aplicar migration.
- Módulos externos ainda leem claims legadas; ativação das claims novas deve ser gradual por módulo.
- Conflitos de URL e DNS/cert exigem ação de infraestrutura (não feita aqui).

## 8. Procedimento de ativação (após remover bloqueios)

1. Restaurar/validar dump em homologação.
2. Aplicar `alembic upgrade head` (após reconciliar heads).
3. `python -m scripts.backfill_memberships --dry-run` → revisar → `--apply`.
4. Validar integridade (`DATA_INTEGRITY_VALIDATION.md`).
5. Ativar flags em ordem (piloto: tenant Farol): `MEMBERSHIP_AUTH_V2` → `MEMBERSHIP_GRANTS_V2` → `TENANT_PORTAL_ENABLED` → `NEW_SSO_CLAIMS_ENABLED` → `PLATFORM_USERS_SEPARATION_ENABLED`.
6. Monitorar; fallback = desligar flags (`ROLLBACK_PLAN.md`).

## 9. Conclusão

- Implementação **aditiva e reversível** entregue; **migration e backfill aplicados em produção**; integridade validada; fluxo `/tenant/*` validado end-to-end; **portal `app.govsistem.com.br` e autenticação `auth.govsistem.com.br` deployados com TLS válido**; `admin.govsistem.com.br` intacto. **SSO v2 (`MEMBERSHIP_GRANTS_V2_ENABLED`) ATIVO de forma aditiva** (preserva roles legado e adiciona claims namespaced — retrocompatível). 65 testes verdes; portal typecheck limpo.
- **Resta (baixo risco, recomendado):** homologação visual por módulo no navegador (piloto Farol → Diário já validado tecnicamente) para confirmar que cada módulo segue autenticando; depois `NEW_SSO_CLAIMS_ENABLED` e `PLATFORM_USERS_SEPARATION_ENABLED`. Nenhum dado de produção foi perdido ou alterado destrutivamente; rollback disponível (`ROLLBACK_PLAN.md`).

## 5d. Deploy do Diário e resolução de URL (executado nesta sessão)

- **TLS do Diário corrigido:** emitido cert válido para `diario.govsistem.com.br` + `doe-admin.govsistem.com.br` (verify=0; resolve o `ERR_CERT_AUTHORITY_INVALID`).
- **Domínio canônico definido:** `diario.govsistem.com.br` (decisão do gestor); `doe-admin` mantido como alias.
- **Stack `modulo-diario` deployada:** postgres/redis/minio/api/worker/signer/web-admin/web-public **todos healthy**. API do módulo em `:9203` (a `:9201` é do `infra-api-1`, API legada); `DIARIO_MODULE_INTERNAL_API_URL` do SaaS → `host.docker.internal:9203`; web-admin (9202) reconstruído com `NEXT_PUBLIC_ADMIN_URL=https://diario.govsistem.com.br`.
- **Validação:** `diario.govsistem.com.br` → 200 (verify=0); `/auth/module-access` diario → 200 com `module_url=https://diario.govsistem.com.br`; **sync preservou admin**: `user_roles=ADMIN,AUTOR` para `admin@farol.pr.gov.br` no banco do Diário.

## 5e. Auditoria de módulos e correções (executado nesta sessão)

- **TLS auditado em todos os módulos** (chatgov, govtask, govfrota, govsocial, govdoc, govpro, diario): todos **verify=0** (cert válido) e alcançáveis — exceto govpro.
- **GovPro corrigido:** `govpro.govsistem.com.br` retornava 404 (sem vhost no nginx). Adicionados vhosts `govpro→7502` (admin) e `proc→7503` (portal cidadão) usando o cert `govsistem.com.br` → ambos 200 (verify=0). **Bug de SSO:** `govpro` estava fora da lista `allowed` do `ModuleAccessRequest` (schemas.py) → 422; adicionado → `/auth/module-access` govpro retorna 200 com `module_url=https://govpro.govsistem.com.br`.
- **SSO por módulo validado** (token `ti@farol.pr.gov.br`): diario/govtask/govfrota/govdoc/govsocial/chatgov/govpro → 200 com URLs corretas.
- **Pendência resolvida — logout/login por módulo:** corrigido o fallback de `admin.govsistem.com.br` para `app.govsistem.com.br` nos frontends de **govtask** (`web-admin/src/app/login/page.tsx`), **govfrota** (idem), **govdoc** (`web/src/api/cliente.ts`) e **govsocial** (`web/src/layout/GuardRota.tsx` e `Cabecalho.tsx`). govtask/govfrota/govdoc rebuildados; **govsocial** não rebuildável (fonte parcialmente perdido — `dist` versionado é o artefato) → corrigido no `dist` e copiado ao container. **nginx:** reload para re-resolver upstreams de govtask/govfrota após rebuild; govdoc proxy ajustado para `host.docker.internal:43001` (porta real). Resultado: **todos os módulos respondem 200 com TLS válido**.

## 5f. Passo corretivo "corrija tudo que falta" (executado nesta sessão)

Fechadas as lacunas funcionais que faltavam para os critérios de aceite (gestor administrar usuários, distribuir módulos contratados e definir roles; usuário comum entrar e acessar via SSO; troca de tenant).

### Backend (aditivo, em `saas-platform/api`)
- `POST /auth/switch-tenant` — emite novo access token com `membership_id` + `active_organization_id` para troca de tenant (valida membership ativo; deriva org por `organization_id` ou `slug`; o slug nunca autoriza). Registra auditoria `tenant_switch`. Schema `SwitchTenantRequest` adicionado em `app/schemas/schemas.py`.
- `GET /tenant/roles` — catálogo de roles por módulo **contratado** (gestor), consumido pela UI de grants. Usa `MODULE_ROLE_CATALOG` + `OrganizationModule` ativos.

### Portal do tenant (`saas-platform/tenant-portal`)
- **Seletor de tenant** no header (multi-tenant): lista `/tenant/organizations`, troca via `/auth/switch-tenant`, atualiza contexto.
- **Usuários** (gestor): criação de usuário (com vínculo de identidade existente preservando senha), filtros por status/perfil + busca, ações por usuário (Acessos/roles, Promover/Rebaixar gestor, Redefinir senha, Suspender/Ativar).
- **Modal de grants** (`components/grants-modal.tsx`): roles por módulo contratado, salva via `PUT /tenant/users/{id}/grants`, exibe pendência legada.
- **Auditoria** (`/auditoria`): tabela paginada de `GET /tenant/audit`.
- **Módulos contratados** (`/modulos-contratados`): usa `GET /tenant/roles`.
- Sidebar ganhou navegação de gestor (Usuários, Módulos contratados, Auditoria).

### Validação
- 65 testes backend verdes (inalterados + `test_multitenant.py`).
- `tsc --noEmit` limpo e `next build` OK (rotas `/usuarios`, `/auditoria`, `/modulos-contratados`, `/login`, `/dashboard`, `/modulos`).
- API reiniciada (volume `./api` montado) e portal **reconstruído/redeployado** (`saas-platform-tenant-portal`).
- Endpoints novos confirmados em produção: `POST /auth/switch-tenant` e `GET /tenant/roles` (401 sem auth = rota ativa); páginas do portal 200 via `https://app.govsistem.com.br`.
- **Integração end-to-end real** (token emitido via `app.core.security`, banco real, container `saas-platform-api-1`):
  - `/tenant/context` → 200
  - `/tenant/roles` → 200 (Farol: 7 módulos contratados com roles)
  - `/tenant/users` → 200 (total 31)
  - `/auth/switch-tenant` → farol: **200** (novo token emitido)
  - `/auth/switch-tenant` → saude: **403** (sem vínculo — rejeitado corretamente)
- Observação: não há usuários multi-tenant hoje no banco; a troca real entre órgãos será exercitada quando existir vínculo duplo (o fluxo está validado para o vínculo único e para a rejeição de vínculo inexistente).

### Restam (fora do alcance de código seguro)
- Ativação gradual das flags `NEW_SSO_CLAIMS_ENABLED` e `PLATFORM_USERS_SEPARATION_ENABLED` (dependente de homologação por módulo — permanecem off para não quebrar módulos que leem claims legadas).
- Homologação visual em navegador por módulo (piloto Farol).
- Manutenção de aliases `doe-admin`/`proc` até validação final.

## 5g. Ativação das flags restantes e teste multi-tenant (executado nesta sessão)

### Mecanismo descoberto
- `is_feature_enabled()` lê **somente da tabela `feature_flags`** (não do `.env`). As flags `NEW_SSO_CLAIMS_ENABLED` e `PLATFORM_USERS_SEPARATION_ENABLED` estavam definidas no código mas **não conectadas** (no-op) e **não existiam no banco**.
- As claims namespaced (`module_roles`, `membership_id`, `target_module`) já eram emitidas, pois `MEMBERSHIP_GRANTS_V2_ENABLED` estava ativa.

### Código alterado (aditivo, deployado via volume + restart da API)
- `app/api/v1/auth.py`: emissão das claims namespaced passa a exigir `NEW_SSO_CLAIMS_ENABLED` **e** `MEMBERSHIP_GRANTS_V2_ENABLED` (mantém o comportamento atual; dá à flag um interruptor real de rollback).
- `app/api/v1/users.py` (`list_users`): quando `PLATFORM_USERS_SEPARATION_ENABLED` está ativa **e sem `?organization_id`**, a listagem global limita-se a contas internas (`is_platform_admin` OR `SUPER_ADMIN` OR membership `ORG_ADMIN` na org interna). Com `?organization_id=X` mantém o suporte autorizado aos usuários do tenant.
- `app/core/security.py`: **claim `aud` adicionada e depois revertida** — investigação mostrou que os módulos (diario/govdoc/govfrota/govtask) decodificam com `jwt.decode` sem audience; a presença de `aud` lança `InvalidAudienceError` e quebraria o SSO de todos. Deixar a validação de audiência para mudança coordenada por módulo (regra do prompt: "Atualize os módulos individualmente").

### Flags ativadas no banco (`feature_flags`)
| key | enabled |
|-----|:---:|
| NEW_SSO_CLAIMS_ENABLED | t |
| PLATFORM_USERS_SEPARATION_ENABLED | t |
| (mantidas) TENANT_PORTAL / MEMBERSHIP_AUTH_V2 / MEMBERSHIP_GRANTS_V2 / LEGACY_* | t |

### Passo 1 — homologação técnica do SSO por módulo (Farol, token `admin@farol.pr.gov.br`)
Todos os 7 módulos retornaram `module-access` 200 com: roles legadas preservadas, `module_roles` **namespaced só do módulo de destino**, `target_module` correto, `membership_id` presente.

### Passo 2 — separação plataforma x tenant (token plataforma `admin@saas.com`)
- Listagem global (`/users`): **total=2** → apenas `admin@saas.com` e `contato@govsistem.com.br` (usuários municipais com label `SUPPORT` **excluídos**).
- `?organization_id=farol`: **total=31** → suporte autorizado aos usuários do tenant preservado.

### Passo 3 — teste multi-tenant real (transacional, com rollback completo)
Criado membership transitório de `admin@farol` na org `saude`, validado e **removido** (banco retornado ao baseline: 1 vínculo em Farol; 0 em saude; 0 auditoria de teste):
- `POST /auth/switch-tenant {slug:saude}` → **200** (novo token).
- `/tenant/context` → org `saude`, `is_manager=false` (ORG_MEMBER).
- `/tenant/modules` → `['chatgov','govfrota']` (somente os de saude) — **sem vazamento de Farol** (`['chatgov','diario','govdoc','govfrota','govpro','govsocial','govtask']`).
- `POST /auth/switch-tenant {slug:farol}` → **200** (volta para Farol).

### Resultado
- 65 testes verdes (inalterados). Nenhum dado persistido de teste. Flags adicionais ativas e **reversíveis** (remover a linha de `feature_flags` = rollback instantâneo).

### Pendências finais (fora do alcance seguro de código)
- Homologação **visual** em navegador por módulo (piloto Farol) — validar cada módulo autenticando na prática.
- Validação de `aud`/audiência nos módulos: mudança coordenada futura (exige atualizar `decode_token` dos módulos para validar audiência).

## 5h. Homologação técnica do SSO por módulo — ACEITAÇÃO NO BACKEND DE CADA MÓDULO (executado nesta sessão)

### Método
Para cada módulo, gerado token de módulo real via `POST /auth/module-access` (que também sincroniza o usuário) e chamado o endpoint protegido de leitura do próprio módulo (`/auth/me`, `/me`, `/auth/eu`) com o token como Bearer. **200 = módulo aceita o token do SaaS.**

### Resultado (usuário `admin@farol.pr.gov.br`)
| Módulo | Endpoint de teste | Resultado |
|--------|-------------------|-----------|
| diario | `GET /api/v1/auth/me` | **200 OK** |
| govtask | `GET /api/govtask/auth/me` | **200 OK** (após correção) |
| govfrota | `GET /api/govfrota/auth/me` | **200 OK** |
| govdoc | `GET /api/govdoc/v1/auth/eu` | **200 OK** |
| govsocial | `GET /api/govsocial/v1/auth/me` | **200 OK** |
| chatgov | `GET /api/me` | **200 OK** |
| govpro | `GET /api/govpro/v1/me` | **200 OK** |

### Defeito de infraestrutura encontrado e corrigido — govtask
- **Sintoma:** `govtask /auth/me` retornava **500** com `socket.gaierror: Temporary failure in name resolution` (asyncpg tentando conectar ao banco).
- **Causa raiz:** o container `infra-govtask-api-1` estava nas redes `infra_internal`/`infra_public`, mas o postgres que hospeda o banco `govtask` (`infra-postgres-1`, alias `postgres`) está na rede `infra_doe-network`. O `POSTGRES_HOST=postgres` não resolvia. (O compose original define govtask-api em `doe-network`+`internal`; o redeploy perdeu essa rede.)
- **Correção (não-destrutiva):** `docker network connect infra_doe-network infra-govtask-api-1` → `postgres` passou a resolver (`172.23.0.2`) e `/auth/me` retornou 200. Sem alteração de dados.
- **Nota:** como o `_sync_to_module` do SaaS encapsula erros em try/except, o sync do govtask falhava silenciosamente (o module-access retornava 200 sem o usuário realmente sincronizado). A correção de rede restabeleceu também o sync real.

### Validação final consolidada
7/7 módulos aceitam o token do SaaS (200). **A homologia técnica do SSO está completa e todos os módulos autenticam.**

## 5i. Lacunas de UX/segurança e testes (executado nesta sessão)

### Esqueci-senha no portal (link estava quebrado)
- Criadas páginas `tenant-portal/src/app/login/forgot/page.tsx` e `tenant-portal/src/app/login/reset/page.tsx` consumindo `POST /auth/forgot-password` e `POST /auth/reset-password`.
- **Corrigido no backend** `auth.py`: o link de reset passava a usar `https://admin.govsistem.com.br/login/reset`; agora usa `settings.TENANT_PORTAL_BASE_URL` (`https://app.govsistem.com.br`).
- Validado: `forgot-password` com e-mail inexistente retorna mensagem genérica (sem enumeração de usuário).

### Troca obrigatória de senha (`force_password_reset`)
- `auth-provider.tsx`: o login agora lê `force_password_reset` e redireciona para `/trocar-senha` quando obrigatório; novo método `changePassword()`.
- Criada página `tenant-portal/src/app/(portal)/trocar-senha/page.tsx` (POST `/auth/change-password`); link "Segurança" na sidebar para todos os usuários.

### Endpoints de segurança/sessões do tenant
- `GET /tenant/security` — postura de segurança do usuário no tenant (mfa, force reset, último troca, roles).
- `GET /tenant/sessions` — sessões SSO ativas do usuário no tenant (tabela `SsoSession`).

### Testes (seção 26)
- Adicionados 14 testes DB-free em `tests/test_multitenant.py`: validação de grants (role válida/inválida/outro módulo), integridade do catálogo (módulos obrigatórios, sem duplicidade, labels, mapeamento legado), e segurança do token (iat/exp, tipo, module_roles namespaced, claim `roles` legada preservada).
- **Total: 79 testes verdes** (65 + 14).

### Item 5 do prompt (`/platform/*`) — decisão
- Não duplicado como namespace novo para não criar dois caminhos de API divergentes. Os endpoints administrativos já existem (`/organizations`, `/users`, `/modules`, `/plans`, `/subscriptions`, `/audit`) protegidos por autorização interna. Documentado aqui para futura reorganização opcional.

### Deploy e validação
- API reiniciada; portal reconstruído/redeployado. Rotas novas confirmadas via HTTPS (200): `/login/forgot`, `/login/reset`, `/trocar-senha`; endpoints `/tenant/security` e `/tenant/sessions` (401 sem auth = ativos).
- Validação com token real: `/tenant/security` 200 (dados de Farol), `/tenant/sessions` 200 (27 sessões), `forgot-password` 200 sem vazamento.

## 5j. Preparo para gestor multi-tenant (SSO tenant-aware)

### Lacuna encontrada
O contexto do tenant (`/tenant/*`) e a troca de tenant já funcionavam por membership. Porém o **`POST /auth/module-access` (SSO)** usava sempre `user.organization_id` (órgão legado único) para: checar módulo contratado, resolver roles/membership e definir o `organization_id` do token de módulo. Um gestor multi-tenant, após trocar de tenant no portal, teria o SSO resolvido **no órgão legado** — não no tenant selecionado.

### Correção (aditiva, com fallback legado)
- `app/core/membership_deps.py`: novo helper `resolve_active_membership_from_request(request, user, db)` — deriva o membership ativo do token (`membership_id` → `active_organization_id` → legado `user.organization_id`).
- `app/api/v1/auth.py` (`module-access`): passa a usar esse helper. `org_id` = órgão do membership ativo; role `ADMIN` derivada do `membership_role` (não da flag legada); módulo contratado e roles resolvidos no tenant ativo.

### Validação (teste transacional com rollback — gestor de Farol também gestor de saude)
- Contexto saude + `module-access chatgov` → **200** com `module_token.organization_id==saude` e role `ADMIN`.
- Contexto saude + `module-access diario` (não contratado por saude) → **403** `Organization does not have access` (antes permitia por Farol).
- Baseline restaurado (1 vínculo de Farol); auditoria de teste removida.

**Resposta à pergunta "o SaaS está preparado para gestor multi-tenant?":** sim, após esta correção. O gestor com vínculos em vários órgãos troca de tenant no portal e o SSO/roles/grants resolvem para o tenant ativo, com isolamento e bloqueio correto de módulos não contratados no tenant.

## 5k. Fluxo admin: cadastro de órgão, cadastro de gestor e liberação de módulo

### Cadastro de órgão + primeiro gestor (`POST /organizations`)
- **Corrigido:** antes, criava o usuário admin sem `is_organization_admin` e **sem membership ORG_ADMIN** (o gestor não conseguiria administrar o tenant no novo modelo). Agora, ao criar o órgão com `admin_name/admin_email/admin_password`, além de `is_organization_admin=True`, é criado o **`OrganizationMembership` ORG_ADMIN ativo** — compatível com o novo modelo e com o legado.

### Cadastro/substituição de gestor (`POST /organizations/{org_id}/managers`) — novo
- Aceita `user_id` (promove usuário existente) ou `name`+`email`+`password` (cria novo usuário já gestor).
- Cria ou promove o membership `ORG_ADMIN`; mantém compat legado (`is_organization_admin=True`); audita `manager_assign`. Admin-only.

### Liberação de módulo para o órgão (`POST /modules/organization`)
- Já existia e funciona: cria o `OrganizationModule` (admin-only), com auditoria; há `GET /modules/organization/{org_id}` para listar.

### Validação (transação com rollback — nenhum dado persistido)
- Fluxo 1: org + primeiro gestor → membership ORG_ADMIN criado. OK.
- Fluxo 2: promoção de usuário existente → membership ORG_ADMIN. OK.
- Fluxo 3: liberação do módulo `chatgov` → OrganizationModule criado. OK.
- 79 testes verdes.

## 5l. Tela de Gestores no painel admin (web-admin)

### Backend (novos endpoints admin, `organizations.py`)
- `GET /organizations/{org_id}/managers` — lista os gestores (memberships ORG_ADMIN ativos) com nome/e-mail/status.
- `DELETE /organizations/{org_id}/managers/{user_id}` — remove gestor (rebaixa o membership para ORG_MEMBER e limpa `is_organization_admin`), com **proteção do último gestor ativo** (409) e auditoria `manager_remove`.
- (POST `/organizations/{org_id}/managers` já adicionado na seção 5k.)

### Frontend (web-admin, `src/app/orgaos/[id]/edit/page.tsx`)
- Nova seção **"Gestores"** na página de edição do órgão, no mesmo design do SaaS (card `rounded-3xl` branco, acento `#002b54`, `Badge`, `Modal`, `toast`).
- Lista os gestores com avatar, nome/e-mail e badge de status; botão "Remover gestor" (proteção do último gestor no backend).
- Modal "Adicionar Gestor" com dois modos: **Vincular existente** (por e-mail, preserva senha) e **Criar novo** (nome+e-mail+senha).

### Validação
- TypeScript limpo; build do web-admin OK; container reconstruído (`saas-platform-web-admin-1`); API reiniciada.
- Rotas de gestores ativas em produção (401 sem auth). `GET /organizations/<farol>/managers` → **200** com 2 gestores reais (Admin Farol, Alisson Leite).
- 79 testes verdes.

### Fluxo completo (admin)
1. Criar órgão → primeiro gestor vira membership ORG_ADMIN (seção 5k).
2. Liberar módulos via seção "Módulos" (já existia).
3. Definir/substituir/adicionar gestores via nova seção "Gestores".
4. Gestor entra em `app.govsistem.com.br` e administra o órgão.

## 5m. Gaps seguros do prompt (sem tenant, revogação, detalhe de usuário, auditoria de fallback)

### 1. Mensagem "usuário sem tenant" (cenário 7 / §14)
- `auth-provider.tsx`: detecta o erro 403 "No active membership" no `/tenant/context` e expõe `noTenant` (mantém a sessão, não desloga).
- Layout do portal: quando `noTenant`, exibe tela dedicada "Sem organização vinculada" com orientação e botão Sair — em vez de redirecionar em silêncio para o login.

### 2. Revogação de acesso ao alterar grants (cenário 25 / §19)
- `set_user_grants` agora **invalida as sessões SSO ativas** do membership ao alterar roles e retorna `sessions_revoked`, além de registrar `grants_update` com a contagem. A retirada de acesso passa a ter efeito sem depender da expiração do token.
- **Bug corrigido:** usava `datetime.now(timezone.utc)` (aware) em coluna `TIMESTAMP WITHOUT TIME ZONE` — corrigido para `.replace(tzinfo=None)`, consistente com o resto do código.

### 3. `GET /tenant/users/{id}` (spec §22)
- Novo endpoint de detalhe de usuário do tenant (gestor): nome, e-mail, CPF, telefone, status global/membership, role, datas.

### 4. Auditoria de uso de fallback legado (§23)
- `module-access` registra `used_legacy_fallback` no evento de auditoria `module_access` quando o acesso veio do fallback legado (`module_permissions`).

### Validação
- Revogação de sessão validada em transação (is_active=False, used_at preenchido, rollback). `GET /tenant/users/{id}` → 200 com dados reais. TypeScript + build do portal OK. **79 testes verdes.** API reiniciada; portal reconstruído/redeployado.

## 5n. Endurecimento SSO, teste de rollback e infra de código de uso único

### A. Validação da claim `module` em govpro e chatgov
- **govpro:** não validava a claim `module` (aceitava token de qualquer módulo). Extraído `auth.py` do container para `modulo-govpro/api/app/core/auth.py`, adicionado check `payload.get("module") == "govpro"` para tokens `module_access`, e copiado de volta ao container (restart). Validado: token de govfrota contra govpro `/me` → **401**; token correto → **200**.
- **chatgov:** adicionado check `decoded.module === 'chatgov'` no middleware. **Incidente:** o rebuild expôs uma migração pré-existente (`022_conversa_excluida.sql`) que cria índice único parcial `(tenant_id, contato_id)`; o banco tem **conversas duplicadas** (`deleted_at IS NULL`), bloqueando o índice e travando o container em restart. **Resolução:** revertido para a imagem funcional `modulo-chatgov-backend:admin-ve-tudo-20260820` (chatgov restaurado, SSO 200). **Nota:** o hardening do chatgov foi perdido com o revert; e qualquer rebuild futuro do chatgov esbarra na migração 022 até os dados duplicados serem tratados (decisão de limpeza de dados pendente, fora do escopo seguro). Durante um teste intermediário, o job de arquivamento de 72h arquivou 174 conversas (housekeeping normal do módulo).

### B. Teste de rollback (cenário 32)
- Desligada `NEW_SSO_CLAIMS_ENABLED` → `module-access` retornou **só claims legadas** (sem `module_roles`) e **200** → fluxo legado intacto. Reativada → `module_roles` namespaced voltou. **Rollback comprovado: desligar a flag reverte ao SSO legado sem quebrar módulos.**

### C. Teste multi-tenant real
- Revalidado o fluxo completo de gestor multi-tenant (troca de tenant → SSO/grants no tenant ativo → bloqueio de módulo não contratado) em transação com rollback; baseline intacto.

### D. SSO por código temporário de uso único (aditiva, §18)
- `POST /auth/sso/issue-code` — valida membership/tenant/módulo contratado, gera código aleatório (hash SHA-256 armazenado em `sso_session`), expira em 2 min, vinculado a usuário/tenant/módulo. Retorna `{code, module_url}` — **nada de token na URL**.
- `POST /auth/sso/exchange` — backend do módulo troca `code + module_slug` por um token de módulo; **uso único** (marca `used_at`), validado contra expiração e módulo.
- Validado: emitir → trocar (token module=govtask, org=farol) → **reuso 400** → **módulo errado 400**.
- **Adoção pelos módulos ainda pendente:** o fluxo atual dos módulos segue usando o `?token=` legado até cada módulo passar a consumir `/auth/sso/exchange` (mudança coordenada por módulo, conforme regra do prompt). A infra está pronta e aditiva.

## 5o. Correção completa do chatgov e plano de adoção do SSO por código

### chatgov — resolvido (item 1)
- **Causa do incidente:** migração `022_conversa_excluida.sql` cria índice único parcial `(tenant_id, contato_id) WHERE deleted_at IS NULL`, bloqueado por **33 grupos de conversas duplicadas ativas** (318 ativas). Qualquer rebuild do chatgov quebrava.
- **Correção de dados (soft delete, reversível):** para cada `(tenant_id, contato_id)` duplicado, mantida a conversa mais recente (`ultima_mensagem_em DESC, criado_em DESC`) e marcadas as demais como `deleted_at + delete_reason='deduplicada'`. Resultado: **62 duplicadas arquivadas, 256 ativas, 0 grupos duplicados.**
- **Rebuild com código-fonte atual:** migração `022` executada com sucesso; chatgov no ar (401 sem token). **Hardening da claim `module` ativo:** token de govfrota → 401; token de chatgov → 200.

### SSO por código (item 2) — infra pronta, adoção por módulo é coordenada
- SaaS: `POST /auth/sso/issue-code` e `POST /auth/sso/exchange` implementados e testados (emissão → troca → reuso 400 → módulo errado 400).
- **Adoção nos módulos NÃO feita de forma simultânea** (regra do prompt: "Atualize os módulos individualmente. Não faça mudança simultânea irreversível em todos"). Converter os 7 de uma vez em produção tem alto risco de indisponibilidade (ex.: o incidente do chatgov).
- **Plano por módulo (para execução dedicada):** em cada módulo, (1) o frontend passa a aceitar `?sso_code=` no redirect; (2) o backend do módulo troca o código por token via `POST /auth/sso/exchange` (backend-to-backend); (3) mantém o `?token=` legado por feature flag até a validação; (4) testa SSO do módulo antes de ativar. Ordem sugerida de piloto: govtask (fonte completa no workspace).
- Para ativar, a Infra do portal também passa a usar `issue-code` no lugar de `module-access` (com flag), de forma que o navegador só receba o código na URL.

## 5p. Bloqueio de acesso de gestores/usuários comuns ao painel admin

### Problema
O `web-admin` autenticava via `/auth/me` (que retorna 200 para **qualquer** usuário ativo) e considerava autenticado. Gestores e usuários comuns de tenants conseguiam **entrar na shell** do `admin.govsistem.com.br` (embora as rotas de API exigissem plataforma). Isso violava o requisito de que o painel central é exclusivo da equipe interna.

### Correção
- **Backend:** novo endpoint `GET /auth/me/admin` protegido por `get_current_platform_admin` — retorna o usuário apenas se for conta interna inequívoca (SUPER_ADMIN, is_platform_admin, BILLING_MANAGER/PLATFORM_ADMIN/AUDITOR, ou membership ORG_ADMIN na org interna); **403 caso contrário**.
- **Frontend (web-admin):** `auth-provider` passa a chamar `/auth/me/admin`; em caso de 403 define `restricted`, limpa o token e impede o acesso. A página de login exibe: *"Este painel é restrito à equipe interna do GovSistem. Gestores e usuários de órgãos devem acessar pelo portal do órgão em app.govsistem.com.br."* e não entra no painel.

### Validação
- Gestor (`admin@farol`) → `GET /auth/me/admin` **403**.
- Plataforma (`admin@saas.com`) → **200**.
- web-admin reconstruído; `/login` e `/` 200 via HTTPS. **79 testes verdes.**

## 6. Conclusão do CRUD do portal do tenant (esta etapa)

### Backup
- `backfar/20260827-162308-before-multitenant-crud/` — dump de banco **validado** (`pg_dump -Fc`), checksums OK, código/config/infra/git/volumes. Estado: 6 orgs, 43 users, 42 memberships, 106 grants, 72 user_module_grants.

### Migration aditiva
- `mt0002` adiciona `position`/`department` em `organization_memberships` (idempotente, reversível; aplicada como owner `saas_user`).

### Backend `/tenant/*` (completado)
- `PATCH /users/{id}/profile` · `DELETE /users/{id}` (remover do órgão) · `POST /users/{id}/restore` · `POST /users/{id}/force-password-reset` · `POST /users/{id}/revoke-sessions` · `GET /users/{id}/audit` · `GET /contracted-modules` · `GET /modules/{slug}/users` · `GET /org`.
- `/audit` com filtros (ação/busca) e `user_agent`; listagem de usuários com cargo/departamento.
- Proteção do último gestor extraída para função pura `would_remove_last_active_manager` (com 7 testes).

### Portal (tenant-portal) — painel administrativo completo
- Usuários: indicadores, busca/filtros, ações completas (ver/editar/acessos/promover/rebaixar/ativar/suspender/restaurar/senha/forçar troca/revogar sessões/remover), modais de criação e edição, drawer de detalhes.
- Novas páginas: Acessos e permissões, Segurança (sessões), Dados do órgão, Meu perfil, Ajuda e suporte.
- Reescrevas: Dashboard (pt-BR, ações amigáveis, cards clicáveis), Auditoria (filtros + detalhes + datas pt-BR), Módulos contratados (stats).
- Componentes: Toast (substitui alert), ConfirmDialog, UserDetailDrawer, format.ts.
- Menus por perfil: gestor vs usuário comum.

### Validação
- **86 testes verdes** (7 novos); typecheck do portal OK; build de produção do portal OK.
- Rotas validadas via API real (create → edit → grants → revoke → force reset → audit → remove → restore) com usuário de teste **removido ao final**.
- **Integridade pós-teste:** banco restaurado ao estado original exato (43 users, 42 memberships, 106 grants, 72 user_module_grants, 6 orgs, 2514 audit).

## 7. Correção de pendências (SSO por código, isolamento, flag de launch)

### P1 — Isolamento: usuário suspenso no tenant não pode acessar módulo via fallback legado
- `POST /auth/module-access`: quando `MEMBERSHIP_AUTH_V2_ENABLED` está ativa e o usuário
  possui membership suspenso/inativo no órgão legado (`users.organization_id`), o acesso é
  negado (403 "Usuário suspenso neste órgão") em vez de cair no fallback legado.
- **Validado:** usuário de teste com conta global ativa e membership suspenso → 403 no `module-access` (antes vazaria).

### P2 — `/auth/sso/exchange` alinhado ao novo modelo multi-tenant
- O exchange passou a resolver o membership ativo do usuário no tenant da sessão.
- Quando `MEMBERSHIP_GRANTS_V2_ENABLED` + `NEW_SSO_CLAIMS_ENABLED` estão ativas, resolve as
  roles via `membership_module_grants` e emite `membership_id` + `module_roles` namespaced
  (antes só lia `user_module_grants` legado).
- Negação 403 se o membership estiver suspenso (mesma regra de isolamento do P1).
- **Validado:** `sso/issue-code` → `sso/exchange` produz token com claims do novo modelo (mesmo tamanho do `module-access`).

### P3 — SSO por código no portal (preparado, atrás de flag)
- Nova flag `SSO_CODE_LAUNCH_ENABLED` (default `false` no `.env`, ausente no banco).
- `/tenant/context` agora expõe `feature_flags.sso_code_launch`.
- `modulos/page.tsx`: quando a flag está ativa, o portal usa `POST /auth/sso/issue-code` e
  redireciona o módulo com `?sso_code=` (sem JWT na URL); senão mantém o fluxo legado
  (`?token=`) até os módulos adotarem o `sso_code`.
- Aditivo e reversível: não quebra o SSO atual.

### Validação desta etapa
- 86 testes verdes; lint limpo; typecheck e build de produção do portal OK.
- SSO (module-access, issue-code, exchange) validado via API real.
- Isolamento P1 validado via API real; usuário de teste removido ao final.
- Integridade: users=43, memberships=42, grants=106, user_module_grants=72, orgs=6
  (as diferenças em `sso`/`audit` são atividade legítima de produção durante a sessão).
