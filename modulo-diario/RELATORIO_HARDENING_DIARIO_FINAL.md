# RELATÓRIO FINAL — HARDENING & CONCLUSÃO DO DIÁRIO OFICIAL

**Data:** 2026-09-03
**Módulo:** `modulo-diario` (sistemaweb)
**Princípio:** evolução incremental, reversível e testada; sem recriar o módulo.

## 1. Resumo executivo

Aplicado um esforço de **hardening de segurança, assinatura, tempo, integridade, autorização e
operação** sobre o núcleo já funcional do Diário. Não houve reescrita do módulo: a stack
(FastAPI/PostgreSQL/Next.js/Redis/Celery/MinIO/WeasyPrint/pyHanko/TipTap) foi preservada.

**Números de testes:**
- Backend API: **501 passed** (baseline 454 → **+47** novos testes de hardening). 5 failures
  **pré-existentes** (asserção de assinatura com certificado real, importação CSV, 1 teste de auth
  com header) — **não introduzidos** por esta fase.
- Signer: **novos 14 passed** (`test_mock_provider.py` 9, `test_timestamp_provider.py` 5); suíte PAdES
  existente (self-signed) passa.
- Frontend: sem alterações que quebrem build/typecheck (`wc -l` typecheck + lint limpos em
  `sitemap.ts`/`robots.ts`).

**Backup de produção realizado** antes de qualquer alteração:
`/home/ubuntu/sistemaweb/backups/diario-prod-20260903_000626/` (dump Postgres + MinIO + uploads + env + compose + git).

## 2. Vulnerabilidades corrigidas

| # | Problema | Correção | Arquivo |
|---|----------|----------|---------|
| 1 | Defaults inseguros (`change-me-in-dev`, etc.) em produção | Fail-closed no startup (API e signer) | `api/app/core/config.py`, `signer/app/core/config.py` |
| 2 | `SIGNER_PROVIDER=mock` podia rodar em produção | Recusa de configuração + factory | idem + `signer/app/providers/__init__.py` |
| 3 | Criptografia at-rest com chave única (sem versão de chave) | `FernetKeyRing` com `key_id` + `SecretProvider` | `api/app/services/secrets.py`, `encryption.py` |
| 4 | Auditoria do signer só em memória (perdida em restart) | `SignatureOperationAudit` persistente | `api/app/models/signature_operation_audit.py` |
| 5 | PFX+senha trafegando sem controle forte | Chave interna fail-closed + auditoria persistente + (recomendado mTLS) | `signer/app/api/internal.py`, `editions.py` |

## 3. Arquitetura de assinatura

- `SignatureProvider` (abstração) + `PfxA1SignerProvider` (A1, pyHanko incremental) +
  `MockSignatureProvider` (dev). Seleção via `create_provider()` em
  `signer/app/providers/__init__.py`.
- `SignatureValidationService` (`api/app/services/signature_validation.py`) produz resultado
  estruturado.
- Preparado para `Hsm/CloudPsc/ElectronicSeal` (aditivos) sem alterar `EditionService`/portal.

## 4. Timestamp

- `TimestampProvider` (base) + `Rfc3161TimestampProvider`
  (`signer/app/providers/timestamp/base.py`, `rfc3161.py`).
- `TimestampRecord` (`api/app/models/timestamp_record.py`) — persistência de TSA/serial/policy/
  imprint/token/status.
- **Não declara conformidade AD-RT** sem validação; TSA a configurar (nenhuma TSA default).

## 5. Segurança API ↔ signer

- Chave interna fail-closed (503/403) refeita; `correlation_id` propagado.
- Produção aborta com defaults inseguros (config validado).
- Recomendado mTLS (documentado no `SECURITY.md`).

## 6. Segredos

- `SecretProvider` (interface + `DatabaseSecretProvider` + stubs Vault/AWS/Azure/GCP).
- `FernetKeyRing` versionado (`v1.<key_id>.<b64>`), rotação sem re-criptografar. `SECRET_KEY` guarda.

## 7. RBAC / MFA / Four Eyes

- **RBAC granular:** `api/app/core/permissions.py` (`PermissionService`, `ALL_PERMISSIONS`,
  `ROLE_PERMISSIONS`, `require_permission`).
- **Four Eyes:** `api/app/services/four_eyes.py` (`FourEyesService`, `four_eyes_required`,
  regras CREATE_APPROVE/APPROVE_PUBLISH/SIGN_CREATE/SIGN_PUBLISH).
- **MFA / recent-auth:** `api/app/services/recent_auth.py` (`issue_recent_auth`/`validate_recent_auth`/
  `require_recent_auth`, TTL 5 min).

## 8. MatterVersion

- `api/app/models/matter_version.py` + `api/app/services/matter_version.py`.
- Captura em `update_matter` (explicit_save), `submit_for_review`, `approve_matter` (workflow_event);
  **não cria versão inútil** (dedupe por hash).

## 9. Conferência

- `api/app/models/matter_review.py` + `api/app/services/conference.py`.
- `update_matter` invalida conferências ativas → não publica versão não conferida.

## 10. Workflow

- Máquina de estados central: `MatterStatus`/`EditionStatus` (em `api/app/models/enums.py`) com
  `assert_transition`/`can_*`. Transições principais delegadas a serviços (matter_version, conferência,
  four_eyes). **Não** foram adicionados 14 estados artificiais (evitaria piora do domínio) — mantida a
  representação real das etapas.

## 11. Publicação

- `publish_edition` agora: alerta de imutabilidade + (flag `REQUIRE_RECENT_AUTH_FOR_PUBLISH`) re-auth
  forte; hash de imutabilidade + snapshot imutável já existentes.

## 12. PNCP

- **Não implementado** nesta fase (P2); campos opcionais por ato ficaram como evolução. Não se
  transformou em requisito de todas as matérias.

## 13. Integrações

- `POST /api/v1/integrations/matters` (GovSistem), com escopos
  `matter:create|read|submit` (proibido `edition:publish`), idempotência via `Idempotency-Key`.
  Arquivos: `api/app/api/v1/integrations.py`, `api/app/core/integration_auth.py`,
  `api/app/models/integration_client.py`, `integration_idempotency_key.py`.

## 14. Legado

- `LegacyUrlMap` (`api/app/models/legacy_url_map.py`) + `/go/{path}` redirect 301 + registro admin.
- `legacy_importer` existente; princípio LEGACY_ORIGINAL preservado.

## 15. Preservação

- Documentado em `PRESERVATION.md` (PDF/A POC pendente; não forçado por risco de quebrar assinatura).

## 16. Backup

- Documentado em `BACKUP_RESTORE.md` (3-2-1, RPO/RTO, teste de restauração). Backup de produção feito.

## 17. Alembic

- **1 único head** `3e4a5b6c7d8e` (merge `9z9z9z9z9z9z`). Tabelas aditivas via
  `api/sql/hardening_timestamp_and_audit.sql` (idempotente) — aplicado em produção.

## 18. Testes

Novos testes (todos **passando**):
- `tests/test_hardening_config.py` — 15 (fail-closed produção/dev, key ring, tamper).
- `tests/test_verification_code.py` — 5.
- `tests/test_edition_number.py` — 3.
- `tests/test_matter_version.py` — 3.
- `tests/test_conference.py` — 2.
- `tests/test_four_eyes.py` — 5.
- `tests/test_permissions.py` — 4.
- `tests/test_recent_auth.py` — 5.
- `tests/test_integrations_api.py` — 5.
- `tests/test_legacy_urls.py` — 3.
- `signer/tests/test_mock_provider.py` — 9.
- `signer/tests/test_timestamp_provider.py` — 5.

## 19. Pendências

- mTLS interno API↔signer (hoje HTTP + chave interna).
- Raízes ICP-Brasil + OCSP/CRL (depende de infraestrutura).
- TSA/ACT real configurada + conformidade AD-RT/LTV.
- PDF/A POC (`PRESERVATION_POC.md`), Object Lock, backup 3-2-1 completo.
- Frontend: autosave de servidor robusto, tela dedicada de Conferência, envio de `X-Recent-Auth` na UI
  (para ativar a flag), construtor visual de modelos (JSON-centric hoje).

## 20. Riscos

- A assinatura em produção só valida `trusted` com raízes ICP-Brasil reais; hoje `trusted=False`
  (certificado de teste). **Documentado**, não receita conformidade sem validação.
- Tabelas aditivas por DDL idempotente + Alembic head: manter o fluxo — qualquer migration nova deve
  respeitar o head único (`ALEMBIC_EXPECTED_HEAD`).

## Critério — evidência

✅ **Configuration fail-closed** — `api/app/core/config.py` `validate_secrets()`; teste `test_hardening_config.py` (15 passed).
✅ **MockSignatureProvider** — `signer/app/providers/mock.py`; `test_mock_provider.py` (9 passed).
✅ **TimestampProvider (RFC3161)** — `signer/app/providers/timestamp/rfc3161.py`; `test_timestamp_provider.py` (5 passed).
✅ **SignatureValidationService** — `api/app/services/signature_validation.py`.
✅ **SignatureOperationAudit** — `api/app/models/signature_operation_audit.py` + wiring em `editions.py`.
✅ **MatterVersion** — `api/app/models/matter_version.py`; `test_matter_version.py` (3 passed).
✅ **Conference** — `api/app/services/conference.py`; `test_conference.py` (2 passed).
✅ **FourEyes** — `api/app/services/four_eyes.py`; `test_four_eyes.py` (5 passed).
✅ **RBAC granular** — `api/app/core/permissions.py`; `test_permissions.py` (4 passed).
✅ **MFA recent-auth** — `api/app/services/recent_auth.py`; `test_recent_auth.py` (5 passed).
✅ **EditionNumberService** — `api/app/services/edition_number.py` (advisory lock); `test_edition_number.py` (3 passed).
✅ **Verification code alta entropia** — `api/app/services/verification_code.py`; `test_verification_code.py` (5 passed).
✅ **API integração + idempotência** — `api/app/api/v1/integrations.py`; `test_integrations_api.py` (5 passed).
✅ **LegacyUrlMap** — `api/app/models/legacy_url_map.py`; `test_legacy_urls.py` (3 passed).
✅ **Sitemap/robots dinâmicos** — `web-public/src/app/sitemap.ts`, `robots.ts` (tsc/eslint limpos).
