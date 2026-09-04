# Assinatura Digital (PAdES ICP-Brasil)

## Objetivo

Produzir assinatura digital **ICP-Brasil** real (não um selo visual/imagem) por edição, com suporte
a carimbo de tempo (TSA/ACT — RFC 3161) e preparação para substituição futura do certificado A1.

## Abstração: SignatureProvider

Interface (`signer/app/providers/base.py`):

```python
class SignatureProvider(ABC):
    def sign(self, pdf_bytes: bytes) -> SignedDocument: ...
    def verify(self, pdf_bytes: bytes) -> bool: ...
    def get_certificate_info(self) -> dict: ...
```

Implementações:

- `PfxA1SignerProvider` (`signer/app/providers/a1.py`) — **A1 ICP-Brasil**, PAdES incremental (pyHanko).
- `MockSignatureProvider` (`signer/app/providers/mock.py`) — **somente dev/homologação**; marca o PDF
  "DOCUMENTO DE HOMOLOGAÇÃO / SEM VALIDADE JURÍDICA / NÃO ASSINADO COM ICP-BRASIL"; **recusado em produção**.

Selection via `create_provider()` (`signer/app/providers/__init__.py`).

## PAdES (A1) — pyHanko

`signer/app/providers/a1.py::sign()`:

- `IncrementalPdfFileWriter` — preserva a revisão-base byte a byte; apenas anexa a revisão de assinatura.
- `/Sig` + `/ByteRange` + CMS em `/Contents`; `ETSI.CAdES.detached`; SHA-256.
- `verify()`/`verify_detailed()` validam criptograficamente (pyHanko); detecção de adulteração de 1 byte.

## Política ICP-Brasil

- OID de referência AD-RB: `2.16.76.1.7.1.11.1.3` (configurável em `PadES`/`get_certificate_info`).
- A conformidade plena (cadeia, raízes ICP-Brasil em `signer/certs/icp-brasil-roots.pem`) **depende de
  infraestrutura externa** (raízes), e não é afirmada sem validação.

## Validação

- `api/app/services/signature_validation.py` — `SignatureValidationService.normalize()` →
  `status/integrity/signature_valid/certificate_valid/chain_trusted/revocation_status/timestamp_status/...`.
- Estados `ValidationStatus`: `pending_validation | valid | invalid | indeterminate`.
- Endpoints: `POST /api/v1/editions/{id}/validate-signature` re-valida pelo signer e persiste o resultado.

## Auditoria de operação de assinatura

- `api/app/models/signature_operation_audit.py` — `SignatureOperationAudit` persistente
  (`operation_id`, `source_hash`, `signed_hash`, `certificate_serial`, `correlation_id`, `result`, `error`).
- **Nunca** registra PFX/senha/chave privada.

## Carimbo de tempo

Ver `TIMESTAMP.md` (RFC 3161).

## Segredos

- `signing_credentials` guarda PFX+senha **criptografados** (Fernet, chave versionada).
- O `signer` é um **serviço isolado**; o portal/container web público não tem acesso à chave privada.

## Transitório: descontinuação do A1

A arquitetura não depende permanentemente do A1: `SignatureProvider` é intercambiável; preparados
para futuros `HsmSignatureProvider`, `CloudPscSignatureProvider`, `ElectronicSealProvider` (aditivos).

## Testes

- `signer/tests/test_pades_signing.py` — assinatura incremental preserva base, `/Sig`/`/ByteRange`,
  integridade `intact=True`, adulteração detectada, páginas/MediaBox inalteradas, hash difere.
- `signer/tests/test_mock_provider.py` — mock ainda é `SignatureProvider`, marca homologação,
  nunca alega ICP-Brasil, factory recusa `mock` em produção, config recusa `mock` em produção.
