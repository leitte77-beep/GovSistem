# MODULE_URL_AUDIT

> Gerado: 2026-08-27 — Fonte: `.env` (`saas-platform`), `infra/nginx/sites/default.conf`, código (`auth.py`, `modules.py`, `main.py`), `SCHEMA_ROLES.md`.
> **Nota de infraestrutura:** este ambiente **não** possui acesso a DNS, certificados, proxy real em execução nem HTTP público dos módulos. Não declaramos DNS/cert como "configurados". Aqui registramos valores de referência e a alteração externa necessária.

## Valores de referência (banco/`.env`/frontend/proxy)

| Módulo | `modules.admin_url` (modelo) | `.env *_MODULE_ADMIN_URL` | `.env *_INTERNAL_API_URL` | proxy nginx | público? |
|--------|------------------------------|---------------------------|---------------------------|-------------|----------|
| chatgov | (código) | chatgov.govsistem.com.br | http://host.docker.internal:3050/api | chatgov.govsistem.com.br → :3050 | sim |
| diario | doe-admin.govsistem.com.br *(documentação)* | **diario.govsistem.com.br** | http://host.docker.internal:9201/api/v1 | *(não no default.conf)* | conflito |
| financeiro | — | — | — | — | **interno (sem domínio)** |
| govavalia | govavalia.govsistem.com.br | govavalia.govsistem.com.br | http://host.docker.internal:4100 | *(não no default.conf)* | sim |
| govdoc | govdoc.govsistem.com.br | govdoc.govsistem.com.br | https://govdoc.govsistem.com.br/api/govdoc | govdoc.govsistem.com.br → :43000 | sim |
| govfrota | frota.govsistem.com.br | frota.govsistem.com.br | http://host.docker.internal:8301/api/govfrota | frota.govsistem.com.br → govfrota | sim |
| govouve | govouve.govsistem.com.br *(docs)* | — | — | *(não listado)* | sim |
| govpro | govpro.govsistem.com.br | govpro.govsistem.com.br | http://host.docker.internal:8203/api/govpro/v1 | *(não no default.conf)* | conflito |
| govsocial | govsocial.govsistem.com.br | govsocial.govsistem.com.br | http://host.docker.internal:8202/api/govsocial/v1 | govsocial.govsistem.com.br → :8202 | sim |
| govtask | govtask.govsistem.com.br | govtask.govsistem.com.br | http://host.docker.internal:8101/api/govtask | govtask.govsistem.com.br → govtask | sim |

`infra/nginx/sites/default.conf` server_name: `govsistem.com.br admin.govsistem.com.br api.govsistem.com.br chatgov.govsistem.com.br govsocial.govsistem.com.br govtask.govsistem.com.br govdoc.govsistem.com.br frota.govsistem.com.br`.

## Conflitos conhecidos

### 1. Diário Oficial — RESOLVIDO (2026-08-27)
- **Domínio administrativo canônico:** `diario.govsistem.com.br` (decisão do gestor).
- `doe-admin.govsistem.com.br` mantido como **alias** (nginx server_name + CORS).
- **TLS:** emitido cert válido cobrindo `diario.govsistem.com.br` + `doe-admin.govsistem.com.br` (verify=0).
- **Deploy:** stack `modulo-diario` no ar (web-admin :9202, web-public :9200, api :9203). O API do módulo foi mapeado para **:9203** (a porta :9201 é ocupada pelo `infra-api-1`, API legada do doe); o `DIARIO_MODULE_INTERNAL_API_URL` do SaaS aponta para `host.docker.internal:9203`.
- **SSO validado:** `/auth/module-access` diario → 200, `module_url=https://diario.govsistem.com.br`, `roles=['ADMIN','ORG_MEMBER','AUTOR']` + `module_roles={'diario':['AUTOR']}`; sync preservou `user_roles=ADMIN,AUTOR` para `admin@farol.pr.gov.br`.

### 2. GovPro — RESOLVIDO (2026-08-27)
- **Domínio administrativo:** `govpro.govsistem.com.br` → web admin (7502); `proc.govsistem.com.br` → portal cidadão (7503). Ambos via vhost nginx com o cert `govsistem.com.br` (SANs cobrem govpro e proc).
- **Fix:** govpro.govsistem.com.br retornava 404 (sem vhost); adicionados vhosts govpro→7502 e proc→7503 (verify=0).
- **Fix SSO:** `govpro` estava ausente da lista `allowed` do validator `ModuleAccessRequest` (schemas.py) → `/auth/module-access` retornava 422; adicionado → 200, `module_url=https://govpro.govsistem.com.br`.
- **Aliases mantidos:** `proc` (portal) e `govpro` (admin).

## URL canônica proposta (a aplicar após confirmação de infra/DNS)

| Módulo | public_url | app_url | admin_url | sso_callback_url | is_public |
|--------|-----------|---------|-----------|------------------|-----------|
| diario | diario.govsistem.com.br | diario.govsistem.com.br | doe-admin.govsistem.com.br | doe-admin.govsistem.com.br | sim |
| govpro | proc.govsistem.com.br | govpro.govsistem.com.br | govpro.govsistem.com.br | govpro.govsistem.com.br | sim |
| demais | (mesmo admin_url) | (mesmo) | (conforme tabela) | (conforme tabela) | sim |
| financeiro | — | — | — | — | **não** |

Aliases mantidos: `doe-admin`↔`diario`, `proc`↔`govpro`.

## Alteração externa necessária (fora do alcance da IA)

- **DNS:** confirmar/apontar registros para os domínios acima.
- **Certificados:** garantir TLS válido (renovação certbot) para `app.govsistem.com.br` e `auth.govsistem.com.br` (novos) e confirmar os existentes.
- **Proxy reverso:** adicionar server_name `app.govsistem.com.br` e `auth.govsistem.com.br` no nginx, com `proxy_pass` para o novo portal/API.
- **CORS/CSRF/CSP:** adicionar `https://app.govsistem.com.br` e `https://auth.govsistem.com.br` à allowlist (config) e ao CSP; manter `https://admin.govsistem.com.br` e módulos.
- **Webhooks/callbacks:** atualizar URLs salvas quando o domínio canônico for definido.

## Implementação no código entregue

- Novo modelo `modules` ganha campos separados de URL (`public_url`, `app_url`, `admin_url`, `sso_callback_url`, `logout_callback_url`, `healthcheck_url`) — migration aditiva; valor `None` mantém o comportamento atual.
- `main.py` e o fluxo `module-access` passam a resolver a URL com precedência documentada: **`*_MODULE_ADMIN_URL` (.env) > `modules.admin_url` (banco) > `modules.base_url`**, registrando alerta se banco ≠ .env.
