# Relatório de Hardening — Módulo Diário Oficial

**Início:** 2026-09-03
**Escopo:** Fortalecimento incremental da segurança, assinatura, integridade, autorização, preservação e operação do `modulo-diario`, conforme o Prompt Mestre de Hardening.
**Princípio:** preservar o que funciona; alterações reversíveis e testadas; nunca recriar o módulo.

---

## 0. Linha de base antes das alterações

**Suíte de testes (API, SQLite in-memory):** `454 passed, 5 failed` (pré-existentes):
- `test_editions.py::test_sign_edition` (502 — depende do signer com certificado real)
- `test_editions.py::test_generate_pdf_already_generated`
- `test_imports.py::TestCsvImport::test_csv_converts_to_table`
- `test_imports.py::TestCsvImport::test_csv_has_plain_text`
- `test_security.py::TestUnauthorizedAccess::test_protected_route_requires_auth_header`

**Observação:** os 5 failures são anteriores e independentes das correções de hardening (cert/CSV/auth em testes). Serão reavaliados ao final.

**Backup de produção:** `/home/ubuntu/sistemaweb/backups/diario-prod-20260903_000626/` (postgres dump + minio + uploads + env + compose + git).

**Alembic:** já consolidado em **um único head** `3e4a5b6c7d8e` (merge `9z9z9z9z9z9z`). `alembic heads` confirma 1 head. Nenhuma ação de merge necessária; apenas adições incrementais.

---

## 1. Auditoria FASE 0 (estado real verificado)

| Item | Estado | Evidência (arquivo) |
|------|--------|--------------------|
| Comunicação API ↔ signer | 🟡 PARCIAL | API envia PFX+senha como base64 para `/internal/sign-pdf` via HTTP `SIGNER_URL` (`signing_credentials.py:224-241`, `editions.py`). Signer aceita PFX no corpo (`internal.py:154-180`). |
| Transporte do PFX / senha | ❌ RISCO | Trafega em HTTP interno, em **texto claro (base64)**. Sem TLS/mTLS entre api e signer. |
| `SECRET_KEY` | 🟡 PARCIAL | Pydantic valida não-vazio quando `DEBUG=false`; defaults `change-me-in-dev` no `.env.example`/compose; dev gera chave temporária. Sem recusa por valor conhecido. |
| `INTERNAL_API_KEY` | 🟡 PARCIAL | Signer fail-closed (503 se ausente) em `internal.py:36-39`; API não valida default conhecido; valor em `settings` sem guarda de produção. |
| Defaults inseguros | ❌ RISCO | `change-me-in-dev` e `diario_password` como defaults no `docker-compose.yml`; signer `LOG_LEVEL=DEBUG` default (`config.py:10`). |
| Assinatura PAdES | ✅ IMPLEMENTADO | `a1.py` pyHanko incremental; `/Sig`,`/ByteRange`,`/Contents`; `ETSI.CAdES.detached`. |
| Validação da assinatura | 🟡 PARCIAL | `verify_detailed` valida integridade e (com raízes) cadeia; **sem OCSP/CRL completa**; cadeia `trusted=False` sem raízes reais. |
| Certificado A1 | ✅ IMPLEMENTADO | `PfxA1SignerProvider`; inspeção; dias restantes; `is_a1` por OID `2.16.76.1.2.1.*`. |
| Trusted roots | 🟡 PARCIAL | `certs/` vazio — raízes ICP-Brasil não presentes; cadeia não valida. |
| OCSP | ❌ AUSENTE | Não implementado. |
| CRL | 🟡 PARCIAL | `icp_brasil.py` tinha `verify=False`; fonte primária é pyHanko. |
| Signer logs | 🟡 PARCIAL | `_sanitize_log` existe mas é pouco usada; auditoria **em memória** (`internal.py:26`). |
| Auditoria persistente do signer | ❌ AUSENTE | `_audit_log` list in-memory, perdida em restart. |
| Celery / jobs de publicação | 🟡 PARCIAL | `worker/app/tasks/generate_edition_pdf.py`, `backup_scheduler.py`, `health.py`; sem pipeline de publicação agendada assíncrono completo. |
| Alembic | ✅ IMPLEMENTADO | 1 head; schema verify fail-closed no startup (`main.py:_verify_schema`). |
| Banco atual | ✅ | `modulo_diario`; 10 MB. |
| Snapshots | ✅ | `EditionPublicationSnapshot` imutável. |
| Publicação | ✅ | `editions.py` fluxo com `PUBLISHED` após assinatura/validação. |
| Numeração de edições | 🟡 PARCIAL | Unique constraint `uq_edition_org_year_number_type`; **sem sequence/lock transacional explícito** no cálculo do próximo nº. |
| Autosave | 🟡 PARCIAL | Frontend usa `localStorage` (`MatterForm.tsx`); sem versão persistida no servidor por matéria. |
| MFA | 🟡 PARCIAL | `mfa.py` + `MFA_REQUIRED_ROLES`; aplicação por papel existe, mas sem conceito `recent_auth` para operações críticas. |
| RBAC | 🟡 PARCIAL | Chefagem por `role` (`require_roles`); sem permissões granulares por ação (`PermissionsService`). |
| Permissions | ❌ AUSENTE | Não há tabela/lista de permissões por ação; autorização centralizada em roles. |
| Fluxo de aprovação | 🟡 PARCIAL | Matéria `DRAFT→REVIEW→APPROVED→PUBLISHED`; sem política FOUR_EYES configurável. |

---

## 2. Alterações realizadas (por fase)

### FASE 1 — Configuração fail-closed + Segredos (P0)

**Config fail-closed (API e signer):**
- `api/app/core/config.py` — `Settings.validate_secrets()`: em produção recusa `SECRET_KEY`/`INTERNAL_API_KEY`/`POSTGRES_PASSWORD` com defaults inseguros conhecidos (`change-me-in-dev`, `changeme`, etc.); recusa `SIGNER_PROVIDER=mock`; exige `INTERNAL_API_KEY` >= 32 chars. Nova propriedade `is_production` e campos `SECRET_PROVIDER`, `SIGNER_PROVIDER`.
- `signer/app/core/config.py` — mesma política; mantém default dev `dev-internal-key-saas` (recusado em produção por ser curto).

**SecretProvider + chave versionada (FASE 1b):**
- `api/app/services/secrets.py` — `FernetKeyRing` (chaves por `key_id`, rotação sem re-criptografar), `seal`/`unseal` versionados (`v1.<key_id>.<b64>`), interface `SecretProvider` + `DatabaseSecretProvider` + stubs `Vault/AwsSecretsManager/AzureKeyVault/GcpSecretManager`. Nunca expõe segredo em log (`__repr__` limpo).
- `api/app/services/encryption.py` — reescrito sobre o key ring; `encrypt/decrypt/encrypt_bytes/decrypt_bytes/current_key_id`; compatibilidade retroativa com payloads Fernet legados sem prefixo `v1.`.

**Evidência/Tipos de testes:**
- `tests/test_hardening_config.py` — 15 passed (roundtrip key ring, tamper detection, fail-closed por parâmetro production/dev).
- Encriptação: `encrypt/decrypt`, `encrypt_bytes/decrypt_bytes`, detecção de adulteração.

### FASE 2 — Mock Signature Provider

- `signer/app/providers/mock.py` — `MockSignatureProvider`: marca o PDF e o metadado com `signature_provider=mock`, watermark "DOCUMENTO DE HOMOLOGAÇÃO / SEM VALIDADE JURÍDICA / NÃO ASSINADO COM ICP-BRASIL"; `verify()` sempre `False`; metadado `subject`/`format` explícito MOCK.
- `signer/app/providers/__init__.py` — factory registra `a1` e `mock`; recusa `mock` em produção (`is_production()`); produz `ValueError` se `mock` em produção.
- `signer/app/core/config.py` — recusa `SIGNER_PROVIDER=mock` em produção (usuário não consegue nem configurar).
- **Testes:** `signer/tests/test_mock_provider.py` — 9 passed (é um `SignatureProvider`, marca homologação, nunca alega ICP-Brasil, factory recusa `mock` em prod, permite em dev, config recusa `mock` em prod).

### FASE 3 — Timestamp Provider (RFC 3161) + estados

- `signer/app/providers/timestamp/base.py` — abstração `TimestampProvider` (`timestamp`, `validate`, `digest`), `TimestampResult`/`TimestampValidation`.
- `signer/app/providers/timestamp/rfc3161.py` — `Rfc3161TimestampProvider`: monta `TimeStampReq` (SHA-256), POST para a TSA, parseia `TimeStampResp`, extrai `policy/gen_time/serial/imprint`, `validate()` reporta `VALID|INVALID|INDETERMINATE`. **Não declara conformidade AD-RT sem validação** — documentado.
- Estados de validação: `api/app/models/enums.py` — novo `ValidationStatus` (PENDING_VALIDATION/VALID/INVALID/INDETERMINATE).
- **Testes:** `signer/tests/test_timestamp_provider.py` — 5 passed (abstração, digest SHA-256, exige URL, request bem-formado, rejeita lixo).
- **Entidade persistente:** `api/app/models/timestamp_record.py` — `TimestampRecord` (all RFC3161 fields + status/validation_status/validation_details + `token_ref` para object storage). Registrado em `models/__init__.py`, relationships `Edition.timestamp_records`, `Signature.timestamp_records`, `Organization.timestamp_records`.

### FASE 4 — Validação de assinatura (serviço central)

- `api/app/services/signature_validation.py` — `SignatureValidationService.normalize()` produz resultado estruturado (`status/integrity/signature_valid/certificate_valid/chain_trusted/revocation_status/timestamp_status/policy/number_of_signatures/validated_at/errors`) e mapeia para `ValidationStatus`.

### FASE 5 — Auditoria persistente do signer

- `api/app/models/signature_operation_audit.py` — `SignatureOperationAudit` (operation_id, org, edition, credential, provider, requested_by, started/finished_at, result, source/signed_hash, cert serial, correlation_id, client_service, error). **Nunca** guarda PFX/senha/private key.
- Wiring em `api/app/api/v1/editions.py` — `sign_edition` gera `operation_id`/`correlation_id` e grava audit no sucesso e na falha; `validate_edition_signature` re-verifica criptograficamente via signer e persiste `signature_validation_status`/`details`.
- Campo `correlation_id` no `InternalSignRequest` do signer (`signer/app/api/internal.py`) + log com correlation_id (sem logar segredo).

### FASE 6 / 9 — estados consistentes

- `ValidationStatus` adotado para assinatura e timestamp (substitui o `valid|invalid|not_validated` limitado em novos campos).

### FASE 13 — Numeração concorrente de edições

- `api/app/services/edition_number.py` — `EditionNumberService.allocate()` usa **PostgreSQL advisory lock** (`pg_advisory_xact_lock`) chaveado por `(organization_id, year, type)`; o cálculo `max()+1` passa a ser atômico dentro da transação. Unique constraint `uq_edition_org_year_number_type` permanece como backstop.
- Wiring: `api/app/api/v1/editions.py` `create_edition` usa o serviço para o número atribuído pelo servidor.
- **Testes:** `tests/test_edition_number.py` — 2 passed (chave determinística/única por tipo+ano; allocate chama advisory lock e retorna max+1).

### FASE 14 — Código verificador de alta entropia

- `api/app/services/verification_code.py` — `generate_secure_code()` (formato `XXXX-XXXX-XXXX-XXXX`, charset 31 sem ambíguos, `os.urandom`), `hash_code()` (SHA-256), comparação constant-time.
- `api/app/models/edition.py` — `verification_code` ampliado para `String(64)`; novo `verification_code_hash`. `generate_verification_code()` passa a usar o gerador seguro.
- Compatibilidade: códigos legados (`20260023-296CD414`) continuam validados por `codes_match` (`document_integrity.py`), que normaliza e tolera ausência de hífen.
- **Testes:** `tests/test_verification_code.py` — 5 passed (formato, unicidade, hash determinístico+normalização, comparação insensível a caixa/hífen, charset de alta entropia).

### FASE 7 — Versionamento de matérias (MatterVersion)

- `api/app/models/matter_version.py` — `MatterVersion` (organization_id, matter_id, version_number, canonical_content, rendered_html, content_hash, created_by, change_reason, source, matter_status); Unique `(matter_id, version_number)`.
- `api/app/services/matter_version.py` — `MatterVersionService.capture()`: hash canônico determinístico; **não cria versão se o conteúdo não mudou** (dedupe); captura em eventos significativos. `canonical_payload`/`hash_canonical`.
- Wiring (`api/app/api/v1/matters.py`): captura em `update_matter` (explicit_save), `submit_for_review` e `approve_matter` (workflow_event).
- Relações: `Matter.versions`, `Organization.matter_versions`; registrado em `models/__init__.py`.
- **Testes:** `tests/test_matter_version.py` — 3 passed (hash muda com conteúdo, estável para mesmo conteúdo, dedupe por hash).

### DDL aplicado em produção (idempotente)

- `api/sql/hardening_timestamp_and_audit.sql` — cria `timestamp_records`, `signature_operation_audits`, `trust_anchors`, `matter_versions` e coluna `editions.verification_code_hash` + amplia `verification_code`. **Aplicado** no Postgres de produção (tabelas confirmadas). Nenhuma alteração destrutiva; documentos oficiais intactos.

### FASE 8 — Conferência formal (MatterReview) + auto-invalidação

- `api/app/models/matter_review.py` — `MatterReview` (organization_id, matter_id, version_id, content_hash, render_hash, reviewed_by, reviewed_at, approved, comments, status `active|invalidated|superseded`, invalidated_at). `is_valid` property.
- `api/app/services/conference.py` — `ConferenceService.create_review()` + `invalidate_for_matter()` (invalida reviews ativas quando o conteúdo muda) + `has_active_review()`.
- Wiring (`api/app/api/v1/matters.py` `update_matter`): após capturar versão, invalida conferências ativas → **não publica versão não conferida**.
- Relação `Matter.reviews`; registrado em `models/__init__.py`; DDL aplicado.
- **Testes:** `tests/test_conference.py` — 2 passed (hash muda com conteúdo; invalidação atualiza status `rowcount`).

### FASE 10 — FOUR_EYES (segregação de funções)

- `api/app/services/four_eyes.py` — `FourEyesService` (configurável via `FOUR_EYES_REQUIRED`), `FOUR_EYES_RULES` (CREATE_APPROVE, APPROVE_PUBLISH, SIGN_CREATE, SIGN_PUBLISH); `check()`/`check_pair()` lançam 403 se o mesmo usuário executa os dois lados.
- `api/app/core/config.py` — `FOUR_EYES_REQUIRED=True`, `RECENT_AUTH_TTL_MINUTES=5`.
- Wiring (`api/app/api/v1/matters.py` `approve_matter`): bloqueia `creator==approver` (MATÉRIA).
- **Testes:** `tests/test_four_eyes.py` — 5 passed.

### FASE 11 — RBAC granular (permissions)

- `api/app/core/permissions.py` — `ALL_PERMISSIONS` (matter.*, edition.*, certificate.*, audit.read, user.manage, role.manage, settings.manage, integration.matter.create), `ROLE_PERMISSIONS` (mapeamento role→permissões), `PermissionService`, `require_permission`/`require_permission_all`.
- **Testes:** `tests/test_permissions.py` — 4 passed.

### FASE 12 — MFA obrigatória + recent_auth

- `api/app/services/recent_auth.py` — `issue_recent_auth()`/`validate_recent_auth()` (token assinado HMAC com TTL de `RECENT_AUTH_TTL_MINUTES`, default 5 min), `require_recent_auth` dependency.
- `api/app/core/config.py` — `RECENT_AUTH_TTL_MINUTES=5`, `REQUIRE_RECENT_AUTH_FOR_PUBLISH=False` (flag para habilitar sem quebrar o fluxo atual até a UI enviar `X-Recent-Auth`).
- Wiring (`api/app/api/v1/editions.py` `publish_edition`): se a flag estiver ativa, exige `X-Recent-Auth` válida para publicar (operação crítica).
- **Testes:** `tests/test_recent_auth.py` — 5 passed.

### FASE 18/19 — API de integração + idempotência

- `api/app/models/integration_client.py` — `IntegrationClient` (organization_id, client_id único, `hashed_api_key` SHA-256, status, `scopes` JSON, last_used_at); **nunca guarda a chave em texto plano**. `has_scope()`.
- `api/app/models/integration_idempotency_key.py` — `IntegrationIdempotencyKey` (client, org, idempotency_key, request_hash, result_entity_id, response_json); Unique `(client_id, idempotency_key)`.
- `api/app/core/integration_auth.py` — `hash_api_key()`, `get_integration_client()` (resolve por hash, ativo), `require_integration_scope()`; `ALLOWED_SCOPES = {matter:create|read|submit}`; **`FORBIDDEN_SCOPES = {edition:publish, edition:sign, certificate:manage}`**.
- `api/app/api/v1/integrations.py` — `POST /api/v1/integrations/matters` com `Idempotency-Key`: cria `Matter` em `DRAFT` (entra no workflow humano), resolve `author_email` para usuário ativo do órgão; reexecução da mesma chave retorna a mesma matéria (duplicate/recovered) ou 409 se o corpo mudar.
- `api/app/schemas/integration.py` — `IntegrationMatterCreate` (MatterCreate + author_email).
- DDL `integration_clients`, `integration_idempotency_keys` aplicado em produção.
- **Testes:** `tests/test_integrations_api.py` — 5 passed (escopos excluem publicação; chave nunca texto plano; 401 sem chave; 401 chave desconhecida; idempotência cria 1 matéria e rejoga retorna a mesma).

<!-- CONTINUAÇÃO DAS FASES 8+ REGISTRADA ABAIXO -->


