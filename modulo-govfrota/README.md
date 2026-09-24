# GovFrota — Gestão de Frota

Módulo do GovSistem para veículos, motoristas, abastecimentos, estoque de
combustível, manutenção e ocorrências.

**Domínio definitivo:** `https://frota.govsistem.com.br`

> O domínio `govfrota.govsistem.com.br` não é mais utilizado.

---

## Administrativo

```text
GovSistem
  → login
  → selecionar "GovFrota"
  → module_access (SSO do SaaS)
  → frota.govsistem.com.br
  → GovFrota identifica usuário + organização + permissões
  → dashboard administrativo
```

- Não existe login administrativo separado: a autenticação vem exclusivamente
  do `module_access` emitido pelo GovSistem.
- Acesso direto a `https://frota.govsistem.com.br` sem sessão/`module_access`
  válido redireciona para o login do GovSistem (`admin.govsistem.com.br/login`).

## Motorista

```text
frota.govsistem.com.br/motorista
  → usuário (login global) + PIN
  → frontend NÃO envia tenant
  → backend localiza a credencial (login_normalized)
  → resolve motorista → organization_id
  → valida acesso/CNH → emite driver_access
  → área mobile simplificada
```

- O motorista **nunca** escolhe empresa/tenant/organização. A organização é
  resolvida automaticamente pelo backend a partir da credencial.
- O login do motorista é **globalmente único** no GovFrota (case-insensitive),
  garantido por constraint no banco (`login_normalized`).
- Logout do motorista redireciona para `/motorista`, nunca para o login admin.

## Resolução do tenant (motorista)

```text
login
→ DriverCredential (acessos_motorista.login_normalized, único)
→ Motorista
→ organization_id
```

Todo dado do motorista (veículos, tanques, combustíveis, abastecimentos) é
sempre validado contra o `organization_id` do token `driver_access`. O tenant
nunca é aceito do frontend (body/query/header/URL).

## Tokens

| Perfil     | Token          | Uso                                                        |
|------------|----------------|------------------------------------------------------------|
| Admin      | `module_access`| `/api/govfrota/*` (área administrativa)                    |
| Motorista  | `driver_access`| `/api/govfrota/app/*` (área mobile)                        |

- `driver_access` (claims): `sub` (motorista_id), `org`, `type=driver_access`,
  `module=govfrota`, `iat`, `exp`.
- Tokens são estritamente separados: `driver_access` não acessa rotas
  administrativas e `module_access` não é tratado como motorista.

## PWA do motorista

```text
manifest: name "GovFrota Motorista", short_name "GovFrota"
start_url: /motorista
scope: /motorista/
display: standalone
```

O Service Worker não cacheia rotas `/api/*` (login, abastecimento, estoque,
uploads).

## Banco

- Migration `003_driver_login_global_unique`: adiciona `login_normalized`
  (trim + lowercase), constraint `UNIQUE` global e check
  `login_normalized = lower(login)`. Detalhes de duplicidades abortam a
  migration com mensagem explícita (nunca perde cadastro silenciosamente).

## Infra

- nginx: `server_name frota.govsistem.com.br`, `client_max_body_size 32m`,
  proxy para `/api/govfrota/*` → `govfrota-api`.
- Docker Compose: `CORS_ORIGINS` inclui `https://frota.govsistem.com.br`.
- SaaS: seed/migration do módulo usa `base_url/api_url/admin_url` =
  `https://frota.govsistem.com.br`.
