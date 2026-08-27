# SSO v2 — Checklist de Homologação por Módulo

> **Atualização:** `MEMBERSHIP_GRANTS_V2_ENABLED` foi reprojetada para ser **aditiva**
> (preserva o claim legado `roles` completo e apenas adiciona `module_roles`/`target_module`/`membership_id`),
> eliminando o risco principal de perda de acesso. A flag está **ATIVA**. A homologação por módulo
> abaixo virou **validação de confirmação** (baixo risco) — mantenha o passo 1.3 para garantir visualmente
> que cada módulo segue autenticando normalmente.

> Pré-requisito: portal `app.govsistem.com.br` e `auth.govsistem.com.br` no ar (TLS válido);
> migration + backfill aplicados; `MEMBERSHIP_GRANTS_V2_ENABLED` **OFF** (SSO de produção preservado).
> Objetivo: ligar o SSO por membership **sem reduzir acesso** de nenhum usuário.

---

## 0. Regra de ouro

Ao ligar `MEMBERSHIP_GRANTS_V2_ENABLED`, o claim `roles` do token de módulo passa a conter
**apenas as roles de grant daquele módulo** (ex.: `['AUTOR']`), em vez de `['ADMIN','ORG_MEMBER','AUTOR']`.
Se o módulo usa `ADMIN`/`SUPPORT`/`ORG_MEMBER` para autorizar, o gestor pode **perder acesso**.
Por isso: **um módulo por vez**, validar no navegador, e **reverter a flag** se houver perda.

---

## 1. Piloto: Diário Oficial (Farol)

### 1.1 Ligar a flag
```bash
# via psql (superuser saas_user, host 9432)
PGPASSWORD=saas_password psql -h localhost -p 9432 -U saas_user -d saas_platform \
  -c "UPDATE feature_flags SET enabled=true, updated_at=now() WHERE key='MEMBERSHIP_GRANTS_V2_ENABLED';"
```

### 1.2 Validar a geração do token (antes de abrir o navegador)
```bash
# chamar /auth/module-access para diario e inspecionar o token
# esperado: roles=['AUTOR'], module_roles={'diario':['AUTOR']}, membership_id presente, module=diario
```

### 1.3 Validar no navegador (CRÍTICO)
1. Abrir `https://app.govsistem.com.br` e entrar com `admin@farol.pr.gov.br`.
2. Ir em **Meus Módulos** → **Diário Oficial** → **Acessar módulo**.
3. Confirmar que o gestor:
   - [ ] entra no Diário normalmente (SSO OK);
   - [ ] **mantém** o nível de acesso que tinha (criar/revisar/assinar/publicar etc. conforme o grant);
   - [ ] não perde a visão de **administração** que usava.
4. Testar com um **usuário comum** de Farol (ex.: `servidor@farol.pr.gov.br`): deve entrar só com as roles dele.

### 1.4 Resultado
- [ ] **OK** → manter a flag ligada e seguir para o próximo módulo.
- [ ] **Perda de acesso** → **reverter imediatamente** (seção 5) e ajustar o mapeamento do módulo.

---

## 2. Próximos módulos (repetir 1.1–1.4)

| Ordem sugerida | Módulo | Grant típico a conferir | Risco específico |
|---|---|---|---|
| 1 | diario | AUTOR..DIARIO_ADMIN | depende de `ADMIN`? |
| 2 | chatgov | CHATGOV_USER/ADMIN | atendentes |
| 3 | govtask | GOVTASK_ADMIN/ASSESSOR | depende de `ADMIN`? |
| 4 | govfrota | ADMIN/GESTOR_FROTA | `ADMIN` |
| 5 | govpro | ADMIN/SERVIDOR | `ADMIN` (alias proc) |
| 6 | govdoc | admin_geral/colaborador | roles em minúsculas |
| 7 | govsocial | GOVSOCIAL_ADMIN/gestor_municipal | `ADMIN` |

> Para cada um: repetir **1.1 (flag já ligada)** → **1.2 token** → **1.3 navegador** → **1.4**.
> Somente avançar para o próximo se o anterior passou. Não ligar para todos de uma vez.

---

## 3. Fase 2 — `NEW_SSO_CLAIMS_ENABLED`

Depois de **todos** os módulos em uso validados com grants v2 OK:

```bash
PGPASSWORD=saas_password psql -h localhost -p 9432 -U saas_user -d saas_platform \
  -c "INSERT INTO feature_flags (id,key,name,description,enabled,created_at,updated_at)
       SELECT gen_random_uuid(),'NEW_SSO_CLAIMS_ENABLED','Claims namespaced no SSO','Emite module_roles/target_module/membership_id',true,now(),now()
       WHERE NOT EXISTS (SELECT 1 FROM feature_flags WHERE key='NEW_SSO_CLAIMS_ENABLED');"
```

- Validar que o token continua **com a claim `roles` legada** (para módulos antigos) **e** as novas claims (`module_roles`, `target_module`, `membership_id`).
- Re-testar no navegador **cada módulo** (o módulo precisa aceitar o token com claims novas; se rejeitar, reverter).

---

## 4. Fase 3 — `PLATFORM_USERS_SEPARATION_ENABLED`

Depois do SSO estável, separar o painel SaaS (contas internas) do portal de tenants:

```bash
PGPASSWORD=saas_password psql -h localhost -p 9432 -U saas_user -d saas_platform \
  -c "INSERT INTO feature_flags (id,key,name,description,enabled,created_at,updated_at)
       SELECT gen_random_uuid(),'PLATFORM_USERS_SEPARATION_ENABLED','Separação do painel SaaS','Usuários do painel = contas internas',true,now(),now()
       WHERE NOT EXISTS (SELECT 1 FROM feature_flags WHERE key='PLATFORM_USERS_SEPARATION_ENABLED');"
```

- Validar que `admin.govsistem.com.br` lista prioritariamente contas internas e que `SUPPORT` de órgão **não** abre o painel.

---

## 5. Rollback imediato (qualquer falha)

```bash
PGPASSWORD=saas_password psql -h localhost -p 9432 -U saas_user -d saas_platform \
  -c "UPDATE feature_flags SET enabled=false, updated_at=now()
      WHERE key IN ('MEMBERSHIP_GRANTS_V2_ENABLED','NEW_SSO_CLAIMS_ENABLED','PLATFORM_USERS_SEPARATION_ENABLED');"
```
- Com as flags off, o SSO volta ao comportamento legado (não reduz acesso).
- As tabelas novas (`organization_memberships`, `membership_module_grants`) ficam intactas/inativas — sem perda.

---

## 6. Sinais de alerta (parar e reverter)

- [ ] Gestor perde acesso a módulo que tinha antes.
- [ ] Usuário comum passa a ver módulo que não tinha (não deve ocorrer — grants v2 ≤ legado).
- [ ] Módulo rejeita token com claims novas (HTTP 401/403 no SSO do módulo).
- [ ] `admin.govsistem.com.br` deixa de funcionar.
- [ ] Qualquer 5xx novo no `/auth/module-access`.

## 7. Comandos de consulta úteis

```sql
-- status das flags
SELECT key, enabled FROM feature_flags
WHERE key IN ('MEMBERSHIP_GRANTS_V2_ENABLED','NEW_SSO_CLAIMS_ENABLED','PLATFORM_USERS_SEPARATION_ENABLED');

-- grants por membership de um usuário (conferir antes de testar)
SELECT u.email, m.membership_role, g.module_slug, g.role_name, g.source, g.requires_review
FROM membership_module_grants g
JOIN organization_memberships m ON m.id = g.membership_id
JOIN users u ON u.id = m.user_id
WHERE u.email='admin@farol.pr.gov.br' ORDER BY g.module_slug, g.role_name;
```
