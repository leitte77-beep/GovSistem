# Arquitetura do Diário Oficial

## Visão

Monorepo `modulo-diario` com serviços separados em containers Docker Compose. O núcleo é uma API
FastAPI/POSTGRESQL com um frontend administrativo (Next.js) e um portal público SSR (Next.js)
mais um serviço isolado de assinatura (`signer`) e um worker (Celery).

```
web-public ─▶ api ─▶ postgres
                │    ─▶ redis (filas)
                │    ─▶ minio (objetos/PDFs)
web-admin ─▶ api │
                └▶ signer (assinatura PAdES + timestamp)
worker (Celery) ─▶ api / minio / postgres
```

## Camadas / serviços

| Serviço | Pasta | Stack | Papel |
|---------|-------|-------|-------|
| `api` | `api/` | FastAPI + SQLAlchemy async | CRUD, fluxo editorial, indexação, validação |
| `web-admin` | `web-admin/` | Next.js 14 + TipTap | Painel administrativo |
| `web-public` | `web-public/` | Next.js 14 SSR | Portal público |
| `signer` | `signer/` | FastAPI + pyHanko + asn1crypto | Assinatura e timestamp |
| `worker` | `worker/` | Celery + Redis | Jobs (PDF, backup) |

Infra: PostgreSQL 16, Redis 7, MinIO.

## Estrutura do backend (`api/app`)

- `models/` — ORM (Edition, Matter, Signature, TimestampRecord, SignatureOperationAudit,
  MatterVersion, MatterReview, IntegrationClient, LegacyUrlMap, TrustAnchors, ...).
- `api/v1/` — rotas administrativas; `api/public_v1/` e `api/public_v2.py` — API pública.
- `services/` — lógica de domínio (edition_number, matter_version, conference, four_eyes,
  signature_validation, secrets, encryption, document_integrity, ...).
- `core/` — config (fail-closed), auth, permissions, integration_auth, storage, tenant.
- `middleware/` — audit, json_logging, security_headers.

## Deploy

`docker-compose.yml` define os serviços e volumes. Migrações via Alembic (`api/app/core/config.py`
`ALEMBIC_EXPECTED_HEAD` faz verificação fail-closed no startup). Tabelas aditivas recentes são
aplicadas via `api/sql/hardening_timestamp_and_audit.sql` (idempotente) no passo de deploy.

## Multi-tenant

Entidades carregam `organization_id`. Autenticação via SaaS central (`app.govsistem.com.br`), com
isolamento por domínio/tenant (`app/core/tenant.py`). Preparado para OIDC/OAuth2 futuro.

## Preservação & Imutabilidade

- Edição publicada = snapshot imutável (`edition_publication_snapshots`).
- Assinatura PAdES incremental preserva os bytes da revisão-base.
- `content_manifest_hash`, `source_pdf_hash`, `signed_pdf_hash` e `matter_content_hash` garantem
  integridade em camadas.

## Observabilidade

- `api/v1/metrics.py`, Sentry (opcional), health checks por serviço.
- Logs JSON (`middleware/json_logging.py`) com `correlation_id` (em operações críticas) e sem segredos.

## Extensibilidade futura

`SignatureProvider`, `TimestampProvider` e `SearchProvider` são abstrações: permitem substituir
assinatura (HSM/Cloud/Selo), ACT e busca (OpenSearch) sem reescrever os serviços/edição/portal.
