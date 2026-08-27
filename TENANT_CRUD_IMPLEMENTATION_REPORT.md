# TENANT_CRUD_IMPLEMENTATION_REPORT.md

**Data:** 2026-08-27
**Escopo:** Conclusão do CRUD do portal do tenant (`app.govsistem.com.br`) e do
backend `/tenant/*`. Alterações aditivas, reversíveis e isoladas por tenant.

## 1. Backup

- Criado em `backfar/20260827-162308-before-multitenant-crud/` (146M), com dump
  válido (`pg_dump -Fc`), checksums validados e `ROLLBACK.md`.
- Estado anterior confirmado: 6 orgs, 43 users, 42 memberships, 106 grants,
  72 user_module_grants, 10 modules, 24 organization_modules.

## 2. Migração aditiva

**`alembic/versions/mt0002_add_membership_profile_fields.py`** (revision `mt0002`,
down_revision `mt0001_add_memberships`):
- Adiciona `position` (cargo) e `department` (departamento) em
  `organization_memberships`.
- Idempotente, aditiva, reversível (downgrade remove as colunas).
- Aplicada no banco (owner `saas_user`). `alembic_version` → `mt0002`.

## 3. Backend (`saas-platform/api/app/api/v1/tenant.py`)

Novas rotas (todas exigem gestor do tenant, alvo no mesmo tenant, com auditoria):

| Método | Rota | Descrição |
|--------|------|-----------|
| PATCH | `/tenant/users/{id}/profile` | Edita perfil (nome/telefone/CPF globais + cargo/departamento do vínculo). E-mail não alterado. |
| DELETE | `/tenant/users/{id}` | Remove do órgão (soft delete do membership + revoga grants e sessões). Protege último gestor. |
| POST | `/tenant/users/{id}/restore` | Restaura vínculo removido (reativa grants). |
| POST | `/tenant/users/{id}/force-password-reset` | Obriga troca de senha no próximo acesso. |
| POST | `/tenant/users/{id}/revoke-sessions` | Revoga sessões SSO do usuário no tenant. |
| GET | `/tenant/users/{id}/audit` | Histórico de auditoria do usuário. |
| GET | `/tenant/contracted-modules` | Módulos contratados com stats (usuários, roles em uso, pendências). |
| GET | `/tenant/modules/{slug}/users` | Usuários com acesso a um módulo (visão por módulo). |
| GET | `/tenant/org` | Dados do órgão. |

Melhorias:
- `/tenant/audit`: filtros `action`, `q` (busca), retorno de `user_agent`.
- `/tenant/users`: listagem agora inclui `membership_id`, `phone`, `position`,
  `department`.
- Proteção do último gestor extraída para função pura testável
  `would_remove_last_active_manager` em `app/services/membership.py`, reutilizada
  nas rotas de status e remoção (bloqueia rebaixar/remover/suspender/autoexcluir
  o último gestor ativo).

## 4. Modelo

- `app/models/organization_membership.py`: adicionados `position` e `department`.

## 5. Portal do tenant (`saas-platform/tenant-portal`)

Novos componentes:
- `src/components/toast.tsx` — feedback não intrusivo (substitui `alert()`).
- `src/components/confirm-dialog.tsx` — confirmação de ações destrutivas.
- `src/components/user-detail.tsx` — drawer de detalhes do usuário.
- `src/lib/format.ts` — datas `pt-BR`/`America/Sao_Paulo`, mapeamento amigável de ações de auditoria.

Páginas:
- **Usuários** (reescrita): indicadores (total/ativos/suspensos/gestores), busca,
  filtros (status/perfil), colunas completas (cargo/setor, vínculo desde),
  ações: ver, editar, acessos, promover/rebaixar, ativar/suspender, restaurar,
  redefinir senha, forçar troca, revogar sessões, remover do órgão. Modais de
  criação e edição, drawer de detalhes, toasts.
- **Acessos e permissões** (nova): visão por módulo contratado, usuários e roles.
- **Módulos contratados** (reescrita): stats por módulo (status, usuários, roles em uso, pendências).
- **Auditoria** (reescrita): filtros (ação/busca), datas pt-BR, ações amigáveis, detalhes expandíveis (IP/agente), sanitização de segredos.
- **Dashboard** (reescrita): datas pt-BR, ações amigáveis, cards clicáveis, ações rápidas, "ver auditoria completa".
- **Segurança** (nova): postura da conta + sessões ativas.
- **Dados do órgão** (nova).
- **Meu perfil** (nova).
- **Ajuda e suporte** (nova).

Menus (sidebar):
- Gestor: Dashboard, Meus módulos, Usuários, Acessos e permissões, Módulos
  contratados, Auditoria, Dados do órgão, Segurança, Ajuda e suporte.
- Usuário comum: Dashboard, Meus módulos, Meu perfil, Segurança, Ajuda e suporte.

## 6. Testes

- 7 novos testes unitários para `would_remove_last_active_manager`.
- Suíte completa: **86 testes passando**.
- Typecheck do portal (`tsc --noEmit`) sem erros.
- Build de produção do portal (`docker compose build tenant-portal`) OK.
- Rotas novas validadas via API real com token de gestor (create, edit profile,
  grants, revoke sessions, force password reset, audit, remove, restore).

## 7. Validação de integridade

Após o teste ponta a ponta (com usuário de teste removido ao final), o banco foi
restaurado ao estado original exato:
- users = 43, memberships ativos = 42, grants = 106, user_module_grants = 72,
  orgs = 6, audit = 2514.
- Nenhum usuário/módulo/role/grant perdido ou alterado indevidamente.

## 8. Feature flags

Não foram alteradas. O novo modelo já está ativo via flags existentes
(`MEMBERSHIP_GRANTS_V2_ENABLED`, `MEMBERSHIP_AUTH_V2_ENABLED`,
`TENANT_PORTAL_ENABLED`).

## 9. Rollback

- Desligar flags de portal/grants e restaurar a imagem anterior do tenant-portal.
- `mt0002` é aditiva; seu downgrade remove apenas `position`/`department`.
- Ver `ROLLBACK_PLAN.md`.
