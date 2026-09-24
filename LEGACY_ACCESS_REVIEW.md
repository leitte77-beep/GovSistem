# LEGACY_ACCESS_REVIEW

> Gerado: 2026-08-27 — Fonte: `saas-platform/SCHEMA_ROLES.md` + código (`core/roles.py`, migrations).
> Nenhum acesso será removido. O legado é preservado e o novo modelo lê com **fallback** para `users.module_permissions`.

## Contexto (problema central)

O SaaS tem **duas fontes** de acesso por módulo:
1. `user_module_grants` (`user_id`, `module_slug`, `role_name`) — canônica, validada contra `MODULE_ROLE_CATALOG`.
2. `users.module_permissions` (`{"modules":["diario", ...]}`) — **legado**, só lista módulos, **sem role**.

A maioria dos usuários de `chatgov` (e vários de `govdoc`) tem acesso **apenas** pelo legado (não há grant). Se o novo fluxo confiar só nos grants, esses usuários **perderiam acesso**. Por isso: **fallback obrigatório** e `requires_review` para o que não tiver mapeamento seguro.

## Mapeamento determinístico (grant equivalente) — do código existente

A migration `e7f8a9b0c1d2_add_user_module_grants.py` já definiu o mapeamento **por módulo** quando backfilleou o legado:

| Módulo | Role padrão quando só legado |
|--------|------------------------------|
| diario | `AUTOR` |
| chatgov | `CHATGOV_USER` |
| financeiro | `FINANCEIRO_VIEWER` |
| (demais) | `AUTOR` *(não é seguro para todos — ver abaixo)* |

Este é o **mapeamento determinístico oficial** já existente no código → pode ser reutilizado para `source=MIGRATED_LEGACY` **apenas para módulos onde o fallback é válido**.

## Regras de migração de acessos legados

Para cada acesso presente em `module_permissions`:
1. Se houver **grant** correspondente em `user_module_grants` → nada a fazer (fonte canônica prevalece).
2. Se **não** houver grant:
   - Se o módulo tiver **mapeamento determinístico seguro** (diario→AUTOR, chatgov→CHATGOV_USER, financeiro→FINANCEIRO_VIEWER) → criar grant com `source=MIGRATED_LEGACY`, `requires_review=false`.
   - Caso contrário (govtask, govsocial, govdoc, govfrota, govpro, govavalia, govouve) → **não inventar role**; criar grant com `source=MIGRATED_LEGACY` **apenas se houver** mapeamento explícito; senão marcar `requires_review=true` e **manter o acesso via fallback legado** até revisão do gestor.
3. Nunca elevar permissão; nunca criar role administrativa como fallback.

## Pendências esperadas (a confirmar no banco)

| Grupo | Módulos legados típicos | Situação |
|-------|-------------------------|----------|
| Usuários Farol/Saúde/Social com `chatgov` e `govdoc` no legado | chatgov, govdoc | chatgov→CHATGOV_USER (seguro); govdoc→ **sem mapeamento seguro** → requires_review |
| `module_permissions` divergentes dos grants (usuários antigos) | vários | `requires_review=true`, exibir pendência ao gestor |
| Usuários inativos com grants/legado (ex.: Felipe Franciscato) | chatgov | Manter; bloqueado globalmente |

## Comando de consulta (após liberar credenciais)

```sql
-- Usuários com módulo no legado mas SEM grant (candidatos a MIGRATED_LEGACY)
SELECT u.id, u.email, u.module_permissions
FROM users u
WHERE u.module_permissions IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM user_module_grants g WHERE g.user_id = u.id
  );
```

## Entregas

- O backfill idempotente gera `membership_module_grants` com `source` correto e `requires_review`.
- O backend expõe a pendência ao gestor (endpoint `/tenant/users/{id}/grants` e dashboard) e mantém o **fallback legado** enquanto houver `requires_review=true` não resolvido (`LEGACY_MODULE_PERMISSIONS_FALLBACK=true`).
