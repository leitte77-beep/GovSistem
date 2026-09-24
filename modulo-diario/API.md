# API do Diário Oficial

A API pública expõe somente dados **publicados** (PUBLISHED), com rate-limit e isolamento de tenant.

## Pública (sem autenticação)

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/public/v1/organization` | Info da organização por domínio |
| GET | `/api/public/v1/editions` | Lista de edições publicadas |
| GET | `/api/public/v1/editions/{year}/{number}` | Detalhe de edição |
| GET | `/api/public/v1/editions/{year}/{number}/snapshot` | Snapshot semântico imutável |
| GET | `/api/public/v1/editions/{year}/{number}/v2` | Snapshot público v2 (view-model) |
| GET | `/api/public/v1/matters` | Lista de matérias publicadas (busca/filtros) |
| GET | `/api/public/v1/matters/{id}` | Detalhe de matéria |
| GET | `/api/public/v1/verify/{code}` | Verificação de autenticidade |
| GET | `/api/public/v1/verification/{code}` | Verificação v2 (tenant-scoped) |
| GET | `/api/download/[...path]` | Download de arquivo público (serve bytes íntegros) |

## Integração externa (GovSistem)

Autenticação: `X-Integration-Key` (chave com escopos). **Nunca** publica edição diretamente.

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/api/v1/integrations/matters` | Cria matéria DRAFT no workflow humano (idempotente via `Idempotency-Key`) |

Escopos permitidos: `matter:create | matter:read | matter:submit`. Proibidos: `edition:publish`,
`edition:sign`, `certificate:manage`.

## Administrativa (Bearer, RBAC)

Matérias: `/api/v1/matters` (create/list/update, `submit-review`, `approve`, `reject`, `content-pdf`,
`semantic/*`). Edições: `/api/v1/editions` (create/list/update, `add-item`, `reorder`, `close`,
`generate-pdf`, `sign`, `validate-signature`, `publish`, `next-number`). Credenciais,
organizações, órgãos, tipos de ato, autoridades, usuários, settings, métricas.

## Dados abertos

- JSON (default). OpenAPI em `/docs` (FastAPI). CSV/XML avaliados para conjuntos apropriados.

## Segmentos novos (hardening)

- `/api/v1/integrations/matters` — integração externa (idempotente).
- `/api/v1/legacy-urls` (admin) + `/go/{path}` (redirect 301 público).
- `/api/v1/matters/{id}/relacoes` — relações jurídicas (matter_relations).
