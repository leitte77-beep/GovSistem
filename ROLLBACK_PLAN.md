# ROLLBACK_PLAN — Multi-Tenant GovSistem

> Gerado: 2026-08-27 — Backup de referência: `backfar/20260827-122010` (código/config/infra/git) e **`backfar/20260827-162308-before-multitenant-crud`** (dump de banco **validado**, checksums OK, código/config/infra). Ver `backfar/<id>/inventario/manifesto.json` e `restauracao/ROLLBACK.md`.

## Princípios

1. Rollback preferencial é **aplicação**, não dados: desligar flags → restaurar app → manter tabelas novas inativas.
2. **Não restaurar banco de produção automaticamente.** Só com corrupção comprovada e dump validado.
3. Nada novo é destrutivo; o legado continua íntegro.

## 1. Rollback do backend

- Desligar flags (DB `feature_flags` → `enabled=false`): `TENANT_PORTAL_ENABLED`, `MEMBERSHIP_AUTH_V2_ENABLED`, `MEMBERSHIP_GRANTS_V2_ENABLED`, `NEW_SSO_CLAIMS_ENABLED`, `PLATFORM_USERS_SEPARATION_ENABLED`.
- Manter `LEGACY_MODULE_PERMISSIONS_FALLBACK=true` e `LEGACY_SSO_CLAIMS_ENABLED=true` (comportamento legado).
- Reimplantar a versão anterior da imagem `saas-platform-api` (comando docker do deploy anterior). As tabelas novas (`organization_memberships`, `membership_module_grants`) ficam **sem uso** — inofensivas.
- Endpoints `/tenant/*` ficam acessíveis, mas sem flags não alteram o fluxo antigo.

## 2. Rollback do frontend / portal

- Parar/despublicar `app.govsistem.com.br` (remover do proxy reverso) ou restaurar a imagem anterior do `tenant-portal` (`saas-platform-tenant-portal`).
- Manter `admin.govsistem.com.br` com a versão antiga do web-admin.
- Se o painel SaaS foi restringido pela flag `PLATFORM_USERS_SEPARATION_ENABLED`, desligá-la restaura a listagem global de usuários.

## 2b. Rollback da migration mt0002 (aditiva)

- A migration `mt0002` (revision `mt0002`) apenas adiciona `position`/`department`
  em `organization_memberships`. É **inofensiva**: não usada pelo fluxo legado.
- Para reverter, se necessário: `alembic downgrade mt0001_add_memberships`
  (executar como owner `saas_user`, pois `saas_app` não tem DDL).
- Os novos endpoints `/tenant/*` dependem apenas de código; voltar à versão
  anterior da imagem `saas-platform-api` desativa o CRUD novo sem tocar o banco.

## 3. Rollback do proxy / infra

- Remover `server_name app.govsistem.com.br` e `auth.govsistem.com.br` do nginx; `nginx -s reload`.
- Reverter `CORS_ORIGINS`/CSP para a lista anterior (remover `app`/`auth`).

## 4. Retorno ao login e SSO antigos

- Com as flags de claims novas desligadas, `create_access_token`/`create_module_token` voltam a emitir somente claims legadas.
- O fluxo `POST /auth/module-access` preserva integralmente o comportamento antigo (roles global sem namespace) quando `MEMBERSHIP_GRANTS_V2_ENABLED=false` e `NEW_SSO_CLAIMS_ENABLED=false`.
- Módulos continuam recebendo tokens como antes (nenhuma mudança destrutiva aplicada).

## 5. Restauração de dados (somente se necessário e validado)

1. Obter dump válido (`pg_dump`) e validar com restauração em banco temporário.
2. `sha256sum -c backfar/<id>/checksums/SHA256SUMS` (código/config).
3. Restaurar volumes/uploads de `backfar/<id>/uploads_e_volumes/`.
4. Restaurar banco com `pg_restore` **após confirmação explícita**.
5. **Perda possível:** quaisquer registros criados depois do dump (memberships/grants novos). Aplicação não destrutiva minimiza isso — o legado não é tocado.

## 6. Validação pós-rollback

- Login antigo em `admin.govsistem.com.br`.
- SSO antigo dos módulos (tokens legados aceitos).
- Contagens de integridade (ver `DATA_INTEGRITY_VALIDATION.md`).
- Nenhum usuário/grant/role sumiu.

## 7. Teste de rollback

- Executar em **ambiente isolado** (homologação com cópia do banco): ativar flags → criar membership/grants → desligar flags → confirmar que o fluxo antigo funciona e que os dados novos ficam inativos (não apagados).

> Qualquer divergência → interromper e reportar. Não improvisar solução destrutiva.
