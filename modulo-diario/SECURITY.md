# Segurança do Diário Oficial

## Postura geral

O módulo adota uma postura **fail-closed** de segurança: em produção, a ausência de segredos, o
uso de defaults conhecidos ou a configuração de um provedor de assinatura não-ICP-Brasil fazem o
processo **abortar o startup** em vez de operar inseguro.

## Configuração em produção (fail-closed)

Implementado em `api/app/core/config.py` e `signer/app/core/config.py` (`validate_secrets`):

- `SECRET_KEY`, `INTERNAL_API_KEY`, `POSTGRES_PASSWORD` não podem usar defaults conhecidos
  (`change-me-in-dev`, `changeme`, etc.) em `ENVIRONMENT=production`.
- `INTERNAL_API_KEY` deve ter >= 32 caracteres em produção.
- `SIGNER_PROVIDER=mock` é **recusado em produção**.

## Comunicação API ↔ signer

- Em produção a `INTERNAL_API_KEY` é obrigatória e forte; o signer recusa chamadas sem a chave
  (503 se ausente / 403 se inválida) — ver `signer/app/api/internal.py`.
- **Transporte do PFX/senha:** hoje o API envia o PFX descriptografado ao signer. Mitigações atuais:
  chave interna fail-closed, credencial criptografada em repouso e auditoria persistente.
- **Evolução recomendada (mTLS):** passa a chave por `credential_id` e o signer resolve o segredo em
  backend seguro (nível: `signer/app/providers/timestamp` + `api/app/services/secrets.py`).

## Segredos e criptografia em repouso

- `api/app/services/secrets.py` — `FernetKeyRing` com `key_id` versionado; `seal`/`unseal`
  (`v1.<key_id>.<b64>`). `SecretProvider` (`DatabaseSecretProvider`) + stubs Vault/AWS/Azure/GCP.
- `api/app/services/encryption.py` — `encrypt/decrypt`, `encrypt_bytes/decrypt_bytes`,
  `current_key_id`; compatível com payloads Fernet legados.
- PFX e senha são criptografados (Fernet) em `signing_credentials.config`; nunca em texto plano.
- Nunca registrar PFX, senha ou chave privada em log.

## Autorização

- **RBAC granular:** `api/app/core/permissions.py` (`PermissionService`, `ALL_PERMISSIONS`,
  `ROLE_PERMISSIONS`, `require_permission`).
- **Segregação de funções:** `api/app/services/four_eyes.py` (`FourEyesService`,
  `four_eyes_required`, `CREATE_APPROVE`/`APPROVE_PUBLISH`/`SIGN_CREATE`/`SIGN_PUBLISH`).
- **MFA / reautenticação forte:** `api/app/services/recent_auth.py` (`issue_recent_auth`,
  `validate_recent_auth`, `require_recent_auth`), TTL configurável.

## Validação criptográfica

- `api/app/services/signature_validation.py` (estruturada) + signer `verify_detailed` (pyHanko).
- Estados de validação `ValidationStatus` (`pending_validation|valid|invalid|indeterminate`).
- Trust store: `api/app/models/trust_anchor.py` (`trust_anchors`).

## Recomendações pendentes

1. TLS/mTLS interno entre `api` ↔ `signer` (hoje HTTP + `X-Internal-Key`).
2. Raízes ICP-Brasil + OCSP/CRL em produção (depende de infraestrutura externa).
3. Rotação de chave Fernet via `ENC_KEY_V*` (camada pronta; ativar em homologação).
