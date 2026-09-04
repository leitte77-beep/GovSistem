# Diário Oficial Eletrônico — Módulo

Plataforma municipal de imprensa oficial eletrônica para o **Município de Farol — Paraná**
(Lei Municipal nº 751/2015). Substitui/migra a plataforma tecnológica preservando o acervo
histórico (numeração, datas, PDFs e assinaturas originais intactos).

## Stack

| Camada | Tecnologia |
|--------|-----------|
| API | FastAPI + SQLAlchemy 2.0 async + PostgreSQL 16 |
| Admin | Next.js 14 + React + Tailwind + TipTap |
| Público | Next.js 14 (SSR) |
| Assinatura | pyHanko (PAdES ICP-Brasil) + pyOpenSSL/cryptography |
| Timestamp | RFC 3161 (TSA/ACT) |
| Filas/Jobs | Celery + Redis |
| Objetos | MinIO (S3-compatível) |
| Orquestração | Docker Compose |

## Serviços

- `api` (FastAPI) — backend principal, CRUD, fluxo editorial, indexação, validação.
- `web-admin` (Next.js) — painel administrativo (autores, revisores, diagramadores, assinadores).
- `web-public` (Next.js SSR) — portal público (busca, acervo, verificação de autenticidade).
- `signer` (FastAPI + pyHanko) — serviço isolado de assinatura PAdES ICP-Brasil.
- `worker` (Celery) — tarefas assíncronas (geração de PDF, backups).

## Princípios

1. **Imutabilidade após publicação** — uma edição publicada nunca é editada; erratas/retificações
   são atos relacionados (não reescrevem o original).
2. **Signatário nunca toca no transporte de segredos** — PFX/senha são criptografados em repouso
   (chave versionada) e o signer é um serviço isolado.
3. **Fonte canônica única** — cada matéria tem um `content_mode` (semantic | legacy_html | original_pdf),
   com HTML renderizado de forma determinística.
4. **Integridade em camadas** — hash por matéria, por arquivo, por edição (antes/depois da assinatura),
   mais a assinatura PAdES ICP-Brasil real.

## Segurança (resumo)

- Configuração **fail-closed**: produção recusa `SECRET_KEY`/`INTERNAL_API_KEY`/`POSTGRES_PASSWORD`
  com defaults inseguros e recusa `SIGNER_PROVIDER=mock`.
- `SignatureProvider` (a1/mock) + `TimestampProvider` (RFC3161) abstraídos e intercambiáveis.
- Estados de validação consistentes (`ValidationStatus`): `pending_validation | valid | invalid | indeterminate`.
- RBAC granular (`PermissionService`), segregação de funções (`FourEyesService`), MFA/recent-auth.
- Auditoria append-only (`audit_events`) + `SignatureOperationAudit` persistente.

## Para começar

```bash
cp .env.example .env            # preencha os segredos
docker compose up -d --build
# Migrações: docker compose exec api alembic upgrade head
```

Ver também: `ARCHITECTURE.md`, `SECURITY.md`, `SIGNATURES.md`, `TIMESTAMP.md`, `BACKUP_RESTORE.md`.
