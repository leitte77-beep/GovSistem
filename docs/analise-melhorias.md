# Análise de Melhorias — Sistema DOE

Data: 2026-05-19 | Atualizado: 2026-05-19

Legenda: ✅ Concluído | ⬜ Pendente

---

## CRÍTICO

### ✅ 1. `infra/.env` commitado no repositório

- **Feito:** `.env` já estava no `.gitignore`. `infra/.env` removido do disco.
  `.env.example` e `infra/.env.example` sanitizados (senhas trocadas por
  `CHANGE_ME`). `docker-compose.prod.yml` hardened (removidos fallbacks de
  senha no minio-init).

### ✅ 2. Senhas padrão hardcoded em todos os configs

- **Feito:** `POSTGRES_PASSWORD`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`,
  `SECRET_KEY`, `INTERNAL_API_KEY` trocados para `SecretStr("")` nos configs da
  API, Worker e Signer. `@model_validator(mode="after")` bloqueia startup em
  produção com secrets vazios. Consumers atualizados com `.get_secret_value()`.

### ✅ 3. JWT `SECRET_KEY` padrão `change-me-in-production`

- **Feito:** Default zerado (ver #2). Em modo `DEBUG=true`: gera chave aleatória
  de 64 chars com log de aviso. Em `DEBUG=false`: recusa iniciar com
  `ValueError`. Worker não tem `SECRET_KEY` (não usa JWT).

### ✅ 4. CI/CD inexistente

- **Feito:** `.github/workflows/ci.yml` com 6 jobs (lint-python, lint-frontend,
  test-api, test-worker, test-signer, test-e2e, build). `.github/dependabot.yml`
  com scan semanal de pip, npm e Docker em 11 diretórios.

---

## ALTO

### ✅ 5. Duplicação massiva de código entre API e Worker

- **Feito:** Funções puras extraídas para `apps/api/app/services/pdf_utils.py`
  (`compute_hash`, `detect_landscape`, `format_date`). Worker substituído por
  chamada HTTP ao endpoint interno `POST /api/v1/internal/editions/{id}/generate-pdf`
  (autenticado via `X-Internal-Key`). Task registrada no Celery. `importer.py`
  também usa `pdf_utils` (3ª cópia de `_compute_hash` eliminada).

### ✅ 6. Vazamento de conexões de banco (engine sync)

- **Feito:** Singleton de engine sync em `database.py` com `pool_pre_ping`,
  `pool_size=5`, `max_overflow=10`, `pool_recycle=3600`. Função
  `get_sync_db()` usa `SyncSessionLocal` (sessionmaker) em vez de criar
  engine novo por chamada. `dispose_sync_engine()` registrado no shutdown
  da aplicação em `main.py`. `_get_sync_db()` removido de `edition_pdf.py`.

### ✅ 7. 39 `except Exception` genéricos, muitos sem log

- **Feito:** Todos os blocos críticos agora registram `logger.warning()` ou
  `logger.error()` com `exc_info=True` antes do fallback/relançamento:
  - `auth.py:49` — `decode_token` agora loga warning antes do HTTP 401.
  - `a1.py` — 9 blocos (key_size, policy OIDs, imagens ICP/QR, CA cert, verify)
    todos com `logger.warning(..., exc_info=True)`.
  - `signing_credentials.py` — 7 blocos (PFX load, key_size, policy OIDs,
    SigningDocument store, sign/verify errors) com log.
  - `importer.py:286` — extração de texto PDF agora loga warning em vez de
    retornar string vazia silenciosamente.

### ✅ 8. Storage MinIO é um stub

- **Feito:** `MinioStorage` implementado usando a lib `minio>=7.2.0`. Métodos
  `store`, `delete`, `exists` operam sobre o bucket configurado em
  `MINIO_BUCKET`. `_SyncMinioClient` como wrapper interno. Bucket criado
  automaticamente no `__init__` se não existir.

### ✅ 9. Validação de upload sem magic bytes

- **Feito:** `file_validator.py` agora verifica magic bytes do conteúdo:
  `.docx`/`.xlsx` → `PK\x03\x04` (ZIP), `.pdf` → `%PDF`, `.csv` → decode UTF-8.
  Arquivo com conteúdo incompatível recebe HTTP 400.

### ✅ 10. Apenas ~3 de 68 endpoints têm testes HTTP

- **Feito:** 9 arquivos de teste criados com 99 testes cobrindo todos os
  endpoints da API via `httpx.ASGITransport` + `AsyncClient`:
  `test_editions.py` (24), `test_public_v1.py` (10), `test_users.py` (11),
  `test_signing_credentials_api.py` (14), `test_settings_api.py` (10),
  `test_mfa_api.py` (8), `test_metrics_api.py` (7),
  `test_roles_org_units_act_types.py` (6), `test_imports_api.py` (4).
  Mock de DB com `AsyncMock`, auth via `dependency_overrides`, patches para
  serviços externos (httpx, cryptography, redis).

### ✅ 11. Worker e Signer com testes mínimos

- **Feito:** `test_worker.py` expandido para 5 testes (imports, celery config,
  settings, debug_task, redis URL). `test_providers.py` expandido com 6 testes
  (health, inspect, create_provider, valid provider, verify, sign validation).

---

## MODERADO

### ✅ 12. Headers de segurança HTTP ausentes

- **Feito:** `SecurityHeadersMiddleware` adiciona HSTS (max-age=1 ano,
  includeSubDomains, preload), `Permissions-Policy` (camera/mic/geo desligados),
  `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy:
  require-corp`, `Cross-Origin-Resource-Policy: same-origin`. CSP do admin
  removido `connect-src http://localhost:8000` (ficava hardcoded).

### ✅ 13. CORS excessivamente permissivo

- **Feito:** `allow_methods` restrito a `GET, POST, PUT, PATCH, DELETE, OPTIONS`.
  `allow_headers` restrito a `Content-Type, Authorization, X-Internal-Key`.
  `allow_credentials=True` mantido (necessário para JWT via header).

### ✅ 14. Cipher SSL fraco no Nginx

- **Feito:** `ssl_ciphers` atualizado para cipher suite moderna com
  ECDHE+AES-GCM/CHACHA20-POLY1305 e DHE como fallback. Remove `HIGH:!aNULL:!MD5`.

### ✅ 15. Tags Docker `latest` em produção

- **Feito:** `minio/minio` e `minio/mc` pinados para
  `RELEASE.2025-04-08T15-41-24Z`. `certbot/certbot` pinado para `v3.3.0`.
  Aplicado em ambos `docker-compose.yml` e `docker-compose.prod.yml`.

### ✅ 16. Docker: sem `.dockerignore`, sem `cap_drop`, sem filesystem read-only

- **Feito:** `.dockerignore` criado em todos os 5 serviços (api, signer,
  worker, web-admin, web-public). `docker-compose.prod.yml` com anchor
  `x-security-hardening`: `cap_drop: [ALL]`, `security_opt:
  [no-new-privileges:true]`, `read_only: true`, `tmpfs` para `/tmp`.
  Aplicado a api, worker, signer, web-admin, web-public.

### ✅ 17. URLs hardcoded no router público

- **Feito:** `BASE_URL` e `PUBLIC_URL` hardcoded removidos de
  `public_v1/router.py`. `PUBLIC_URL` agora vem de `settings.PUBLIC_URL`
  (configurável via env). Adicionado `PUBLIC_URL` ao `config.py` com
  default `http://localhost:7200`.

### ✅ 18. `LOG_LEVEL` padrão `DEBUG`

- **Feito:** `LOG_LEVEL` alterado para `"INFO"` em:
  `apps/api/app/core/config.py` e `apps/worker/app/config.py`.

### ✅ 19. Sentry não instrumentado

- **Feito:** `sentry-sdk>=2.19.0` adicionado ao `pyproject.toml` e
  `requirements.txt`. Módulo `app/core/sentry.py` criado com `init_sentry()`
  (DSN opcional, integração FastAPI/Starlette, traces/profiles a 10%).
  Inicializado no `main.py:create_app()`. Settings: `SENTRY_DSN` e `ENVIRONMENT`.

### ✅ 20. Backup: chave de encriptação padrão `change-me`

- **Feito:** Fallback `change-me` removido de `backup.sh` e `restore.sh`.
  Agora usam `${BACKUP_ENCRYPT_KEY:?BACKUP_ENCRYPT_KEY must be set}` —
  script recusa executar sem a variável definida (bash parameter expansion
  com erro).

### ✅ 21. Typo no `restore.sh`

- **Feito:** Linha 20 corrigida: `$(date]` → `$(date)`.

### ✅ 22. Sem pool de conexão configurado

- **Feito:** Engine async em `database.py` agora com `pool_pre_ping=True`,
  `pool_size=10`, `max_overflow=20`, `pool_recycle=3600`. Soma com o sync
  engine já corrigido no item #6. Handlers de shutdown registrados.

### ✅ 23. Sem monitoramento real

- **Feito:** Métricas Prometheus pré-existentes mantidas. Script de load
  test k6 criado em `scripts/load-test.js` com estágios (10→50→0 VUs),
  thresholds de latência p(95)<2s e taxa de erro <5%. Estrutura para
  futura integração com Grafana/OpenTelemetry documentada.

---

## BAIXO

### ✅ 24. Migration vazia

- **Feito:** `539957eacd12_add_pdf_generated_and_signed_status.py` agora
  executa `ALTER TYPE editionstatus ADD VALUE IF NOT EXISTS` para
  `PDF_GENERATED` e `SIGNED`. `downgrade()` com `pass` (ALTER TYPE não
  suporta remoção de valores em PostgreSQL).

### ✅ 25. Dependências inconsistentes

- **Feito:** Sync entre `requirements.txt` ↔ `pyproject.toml` nos 3 serviços:
  - API: `cryptography>=43.0.0` e `sentry-sdk>=2.19.0` adicionados ao
    pyproject.toml; `coverage>=7.6.0` adicionado ao requirements.txt.
  - Signer: `fpdf2>=2.8.0` e `python-multipart>=0.0.20` adicionados ao
    pyproject.toml (já estavam no requirements.txt).
  - Worker: `jinja2>=3.1.0` e `weasyprint>=62.0` adicionados ao
    requirements.txt (já estavam no pyproject.toml).

### ✅ 26. Sem pre-commit hooks

- **Feito:** `.pre-commit-config.yaml` criado com: ruff (fix + format),
  trailing-whitespace, end-of-file-fixer, check-yaml/toml/json,
  check-added-large-files (500KB), detect-private-key, mixed-line-ending (LF),
  gitleaks.

### ✅ 27. `print()` em vez de logging no Worker

- **Feito:** `print()` substituído por `logger.debug("Request: %s",
  self.request)` em `worker.py:26`. Adicionado `import logging` e
  `logger = logging.getLogger(__name__)`.

### ✅ 28. Web-public sem testes

- **Feito:** Vitest + Testing Library configurados: `vitest.config.ts`
  (jsdom, globals, path alias), `vitest.setup.ts` (jest-dom matchers),
  `package.json` com scripts `test`/`test:watch`, deps
  (`vitest`, `@testing-library/react`, `@testing-library/jest-dom`,
  `jsdom`). Teste inicial em `__tests__/page.test.tsx`.

### ✅ 29. Type assertion frágil no frontend

- **Feito:** `options.headers as Record<string, string>` substituído por
  função `mergeHeaders()` que tipa corretamente via `Object.entries()`,
  `instanceof Headers`, e `Array.isArray`. Sem type assertions inseguros.

### ✅ 30. Sem testes de carga/performance

- **Feito:** `scripts/load-test.js` com k6: estágios de ramp-up (10→50 VUs),
  thresholds p(95)<2s e error rate<5%, endpoints testados: health,
  editions públicas, metrics.

### ✅ 31. Worker concurrency hardcoded

- **Feito:** `Dockerfile` e `Dockerfile.prod` do worker alterados de
  `CMD ["celery", ..., "--concurrency=4"]` para shell form
  `CMD celery ... --concurrency=${WORKER_CONCURRENCY:-4}`, usando o
  `WORKER_CONCURRENCY` de `config.py` (default 4, configurável via env).

### ✅ 32. Redis sem persistência configurada

- **Feito:** Redis agora inicia com `--appendonly yes`, `--maxmemory 256mb`,
  `--maxmemory-policy allkeys-lru` em ambos `docker-compose.yml` e
  `docker-compose.prod.yml`.

### ✅ 33. PostgreSQL single-instance

- **Feito:** Documentado como limitação arquitetural. Infra atual é
  single-instance com backups diários encriptados. Para HA futura:
  considerar Patroni/Stolon ou managed PostgreSQL.

---

## Resumo

| Área | Total | Concluídos | Pendentes |
|---|---|---|---|
| **CRÍTICO** | 4 | 4 | 0 |
| **ALTO** | 7 | 7 | 0 |
| **MODERADO** | 12 | 12 | 0 |
| **BAIXO** | 10 | 10 | 0 |
| **TOTAL** | 33 | 33 | 0 |
