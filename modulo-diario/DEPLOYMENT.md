# Deploy do Diário Oficial

## Pré-requisitos

- Docker + Docker Compose.
- `.env` preenchido (segredos fortes; ver `SECURITY.md` — produção recusa defaults).

## Subir

```bash
cp .env.example .env
# PREENCHER segredos (SECRET_KEY, INTERNAL_API_KEY, POSTGRES_PASSWORD, MINIO_*)
docker compose up -d --build
```

## Migrações / DDL

```bash
# Alinhar o esquema (Alembic) — obrigatório antes de servir tráfego
docker compose exec api alembic upgrade head
# Tabelas aditivas do hardening (idempotente)
docker compose exec -T postgres psql -U diario_user -d modulo_diario < api/sql/hardening_timestamp_and_audit.sql
```

O startup da API aborta se o banco não estiver no head esperado (`ALEMBIC_EXPECTED_HEAD`).

## Health checks

- API: `GET /api/v1/health`
- signer: `GET /api/v1/health` (porta interna `8100`)
- web-public/web-admin: `/api/health`

## Ambientes

- `development` / `homologation` / `production` (var `ENVIRONMENT`).
- **Nunca** usar certificado de produção em desenvolvimento; bancos/storages independentes.
- `SIGNER_PROVIDER=mock` **só** em dev/homolog.

## CI/CD (objetivo)

lint → typecheck → tests → build → security scan → migration check → deploy homolog → smoke →
aprovação manual → produção. Backup antes de migrações críticas.

## Rollback

- Código: `git revert <commit>` (checkpoints de commit isolados).
- Tabelas aditivas: idempotentes e não destrutivas; remover colunas/tabela exige guarda.
- Imagens: rebuild pelas imagens anteriores.
