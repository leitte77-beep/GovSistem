# DATA_INTEGRITY_VALIDATION

> Gerado: 2026-08-27 — **Atualizado após acesso real ao banco e aplicação da migration + backfill.**
> Banco: `saas_platform` (produção), head Alembic `govpro01` → `mt0001_add_memberships`.

## Resultado da validação (antes → depois)

| Item | Antes | Depois | Δ |
|------|-------|--------|---|
| Total de usuários (`users` sem `deleted_at`) | 43 | 43 | 0 ✅ |
| Usuários ativos | 42 | 42 | 0 ✅ |
| Usuários inativos | 1 | 1 | 0 ✅ |
| Hashes de senha presentes | 43 | 43 | 0 ✅ |
| Tenants (`organizations`) | 6 | 6 | 0 ✅ |
| Tenants ativos | 4 | 4 | 0 ✅ |
| Módulos (`modules`) | 10 | 10 | 0 ✅ |
| Vínculos tenant/módulo (`organization_modules`) | 24 | 24 | 0 ✅ |
| Grants legados (`user_module_grants`) | 72 | 72 | 0 ✅ (preservado) |
| Gestores (`users.is_organization_admin`) | 4 | 4 | 0 ✅ |
| Memberships (`organization_memberships`) | 0 | 42 | aditivo (42 = usuários com org) ✅ |
| Memberships ORG_ADMIN | 0 | 4 | = gestores ✅ |
| Grants de membership (`membership_module_grants`) | 0 | 106 | aditivo ✅ |
| — MIGRATED_GRANT | 0 | 72 | 1:1 dos grants legados ✅ |
| — MIGRATED_LEGACY | 0 | 34 | 1 seguro + 33 pending review ✅ |
| — requires_review | 0 | 33 | acessos legados sem mapeamento seguro (acesso mantido por fallback) |

## Regras absolutas verificadas

- Nenhum usuário desapareceu; IDs/hashes inalterados. ✅
- Nenhum ativo foi desativado; nenhum inativo foi reativado. ✅
- Nenhum grant/role/`module_permissions` removido (backfill aditivo; `user_module_grants` intocado). ✅
- Memberships espelham `users.organization_id` (42) e `is_organization_admin` (4 ORG_ADMIN). ✅
- 33 pendências de revisão de acesso legado registradas; o acesso desses usuários continua garantido por `LEGACY_MODULE_PERMISSIONS_FALLBACK=true`. ✅

## Garantias técnicas

- Backfill idempotente (verificação de existência) → reexecutar não duplica.
- Migration `mt0001_add_memberships` puramente aditiva (2 tabelas + 4 colunas em `modules`).
- Feature flags novas permanecem **desligadas** → comportamento legado preservado até ativação.

## Pendência de revisão (não resolvida nesta etapa)

33 grants marcados `requires_review` correspondem a acessos que existem apenas no
`module_permissions` legado (ex.: govdoc, govtask, govsocial) sem role determinística
segura. Cada gestor deve revisar/atribuir roles via portal (`/tenant/users/{id}/grants`).
Ver `LEGACY_ACCESS_REVIEW.md`.

