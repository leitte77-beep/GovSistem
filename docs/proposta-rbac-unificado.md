# Proposta: RBAC unificado para a plataforma (control plane + módulos)

> Status: **desenho para revisão** — nenhum código alterado ainda.
> Decisões tomadas: granularidade por **papéis (RBAC)** • autorização **espelhada por sync** nos módulos • entregar primeiro o **plano**.

## 1. Problema atual

Hoje existem três modelos de permissão que não conversam:

| Sistema | Como guarda papéis | Como verifica |
|---|---|---|
| **SaaS** (control plane) | flags na `users`: `is_platform_admin`, `platform_role` (string livre), `is_organization_admin`, `module_permissions` (JSON, **morto**) | `get_current_platform_admin`, `require_platform_role(*roles)` |
| **Diário** | RBAC real: tabelas `roles` + `user_roles` (8 papéis) | `require_roles(*roles)` |
| **Financeiro** | usa as flags do SaaS (mora dentro do SaaS) | `require_platform_role` |
| **ChatGov** | recebe papéis via sync, lógica própria | — |

**Ponto de quebra:** no SSO, o SaaS manda papéis genéricos (`ADMIN`, `ORG_MEMBER`...) e cada módulo "adivinha" o papel local. No Diário (`modulo-diario/api/app/api/v1/internal.py`, `_module_roles`):

```python
if roles & {"SUPER_ADMIN","PLATFORM_ADMIN","ADMIN","SUPPORT"}: return {"ADMIN"}
if "AUDITOR" in roles: return {"AUDITOR"}
return {"AUTOR"}   # todo o resto cai aqui
```

Consequências:
1. Papéis ricos do Diário (REVISOR, DIAGRAMADOR, ASSINADOR, PUBLICADOR) **são inalcançáveis pelo SSO**.
2. Não há lugar único que responda "quem pode o quê".
3. `platform_role` é string livre, sem validação; `module_permissions` nunca foi usado.
4. Cada módulo novo reinventa o controle de acesso.

## 2. Princípios do novo modelo

1. **O control plane (SaaS) é a fonte única de verdade** de quem-pode-o-quê.
2. **RBAC por papéis** (sem permissões atômicas) — mantém o que a equipe já entende.
3. Cada papel pertence a um **escopo**: `platform` (toda a plataforma) ou `module` (um módulo específico).
4. Os módulos **continuam espelhando** os papéis via o `sync-user` que já existe — permite revogação imediata.
5. O mapeamento hard-coded (`_module_roles`) **deixa de existir**: o SaaS já manda os papéis corretos.

## 3. Modelo de dados (no saas-platform)

### 3.1 Catálogo central de papéis — `roles`

Substitui o `platform_role` string-livre e centraliza o catálogo dos módulos.

| coluna | tipo | nota |
|---|---|---|
| `id` | uuid | |
| `scope` | enum `platform` \| `module` | |
| `module_slug` | string, nullable | obrigatório quando `scope=module`; null quando `platform` |
| `name` | string, único | namespaced: `platform.super_admin`, `diario.revisor`, `financeiro.billing_manager` |
| `label` | string | rótulo amigável ("Revisor do Diário") |
| `description` | text | |
| `is_system` | bool | papéis de sistema não podem ser apagados |

### 3.2 Concessões por usuário — `user_module_grants`

Substitui as flags soltas (`is_platform_admin`, `is_organization_admin`, `platform_role`) **e** o `module_permissions` morto.

| coluna | tipo | nota |
|---|---|---|
| `id` | uuid | |
| `user_id` | uuid FK users | |
| `organization_id` | uuid FK organizations, nullable | null = grant de plataforma (cross-org) |
| `module_slug` | string, nullable | null para papéis de escopo `platform` |
| `role_id` | uuid FK roles | |
| — | | `UNIQUE(user_id, organization_id, module_slug, role_id)` |

Uma linha = "usuário X tem o papel Y no módulo Z da organização W". Concessão e revogação viram insert/delete simples.

### 3.3 Seed inicial do catálogo

```
platform.super_admin, platform.admin, platform.billing_manager,
platform.support, platform.auditor
diario.admin, diario.autor, diario.revisor, diario.diagramador,
diario.assinador, diario.publicador, diario.auditor
financeiro.admin, financeiro.billing_manager, financeiro.viewer
chatgov.admin, chatgov.user
```

## 4. Fluxo de autorização (runtime)

```
1. Login no SaaS  ───────────────► access_token (papéis de plataforma)
2. POST /module-access {slug}
     • valida que a org tem o módulo (organization_modules) — já existe
     • CONSULTA user_module_grants do usuário p/ aquele módulo+org
     • resolve a lista de papéis reais: ex. ["diario.revisor","diario.diagramador"]
     • sync-user → envia ESSA lista (sem _module_roles)
     • emite module_token com a lista
3. Módulo recebe sync-user
     • grava/atualiza espelho em user_roles local (nomes já corretos)
4. Endpoints do módulo: require_roles("diario.revisor", ...) casa direto
```

Diferença-chave: o passo que hoje "achata" tudo em ADMIN/AUTOR é removido. O SaaS manda exatamente os papéis concedidos.

## 5. UI de administração (objetivo final)

Uma tela "Acessos" por usuário:

```
Usuário: maria@orgao.gov.br        Organização: Prefeitura X
┌─────────────────────────────────────────────┐
│ Módulo        Papéis                          │
│ Plataforma    [Auditor ▾]                     │
│ Diário        [Revisor ✕] [Diagramador ✕] [+] │
│ Financeiro    [— sem acesso —]            [+] │
│ ChatGov       [Usuário ✕]                 [+] │
└─────────────────────────────────────────────┘
```

Cada `[+]` lista apenas papéis do catálogo cujo `module_slug` bate com a linha. Conceder = inserir grant; o sync propaga ao módulo no próximo `module-access` (ou imediatamente via push opcional).

## 6. Plano de migração (incremental, sem big-bang)

**Fase 1 — Catálogo + grants (SaaS)**
- Migration: criar `roles` (novo schema) e `user_module_grants`; seed do catálogo.
- Migration de dados: traduzir flags existentes →
  - `is_platform_admin=True` → grant `platform.super_admin`
  - `platform_role='X'` → grant `platform.x`
  - `is_organization_admin=True` → grant `diario.admin` + `financeiro.admin` (revisar) na org do usuário
  - papéis atuais em `user_roles` do Diário → grants `diario.*` correspondentes
- Manter flags antigas funcionando em paralelo (leitura dupla) durante a transição.

**Fase 2 — SSO passa a resolver grants**
- `/module-access` consulta `user_module_grants` e emite papéis namespaced.
- `sync-user` recebe nomes namespaced; espelho local passa a aceitá-los.

**Fase 3 — Limpeza**
- Remover `_module_roles` (Diário) e a lógica de flags no `auth.py` do SaaS.
- Atualizar `require_roles(...)` nos endpoints para os nomes namespaced.
- Dropar colunas `is_platform_admin`, `platform_role`, `is_organization_admin`, `module_permissions`.

## 7. Impacto / arquivos que serão tocados (referência futura)

- `saas-platform/api/app/models/` → novos `role.py`, `user_module_grant.py`; ajustar `user.py`.
- `saas-platform/api/app/api/v1/auth.py` → resolver grants no login e no `module-access`.
- `saas-platform/api/app/api/v1/users.py` → CRUD de grants.
- `saas-platform/api/alembic/versions/` → migrations de schema + dados.
- `modulo-diario/api/app/api/v1/internal.py` → remover `_module_roles`, aceitar nomes namespaced.
- `apps/api` (cópia) → manter espelhado com `modulo-diario`.
- Módulos: `require_roles(...)` com novos nomes.

## 8. Riscos e mitigação

- **Duplicação `apps/api` vs `modulo-diario/api`**: hoje há duas cópias do Diário. Qualquer mudança precisa ser feita nas duas (ou consolidar antes). *Recomenda-se decidir qual é a canônica antes da Fase 1.*
- **Revogação**: como o módulo espelha, revogar um grant só reflete no próximo `module-access`. Mitigar com um endpoint interno de revogação push, se necessário.
- **Org-less users (super admin)**: grants com `organization_id=null` cobrem acesso cross-org.

## 9. Perguntas em aberto para a próxima rodada

1. Consolidar `apps/api` e `modulo-diario/api` numa única base antes de começar?
2. `financeiro` continua dentro do SaaS ou vira módulo separado com seu próprio espelho?
3. Um usuário pode ter papéis em mais de uma organização (multi-tenant real) ou é sempre 1 org?
