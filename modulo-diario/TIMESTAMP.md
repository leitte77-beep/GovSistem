# Carimbo de Tempo (RFC 3161 / TSA / ACT)

## Abstração: TimestampProvider

Interface (`signer/app/providers/timestamp/base.py`):

```python
class TimestampProvider(ABC):
    def timestamp(self, document_digest: bytes, policy: str = "") -> TimestampResult: ...
    def validate(self, token: bytes) -> TimestampValidation: ...
    def digest(self, data: bytes) -> bytes: ...
```

- `TimestampResult` — token, tsa_name/url, serial, policy_oid, message_imprint, gen_time, status,
  validation_status.
- `TimestampValidation` — status (`VALID|INVALID|INDETERMINATE`), valid, policy, gen_time, errors.

## Implementação RFC 3161

`signer/app/providers/timestamp/rfc3161.py` — `Rfc3161TimestampProvider(tsa_url, timeout)`:

- `timestamp(digest, policy)` monta `TimeStampReq` (SHA-256), faz POST `application/timestamp-query`
  para a TSA, parseia `TimeStampResp`, extrai `policy/gen_time/serial/imprint`, devolve o token.
- `validate(token)` valida a estrutura do CMS e o `message_imprint`, retornando `VALID|INVALID`.

### Configuração

- `tsa_url` deve apontar para uma TSA/ACT credenciada (ICP-Brasil). Sem URL → `ValueError`.
- **Não há TSA configurada por padrão.** A assinatura continua válida como PAdES-BES **sem** comprovação
  temporal externa; para PAdES AD-RT/LTV é preciso configurar uma ACT e a política adequada.

### Cautela

- O módulo **não declara conformidade AD-RT** sem validar tecnicamente a política usada. A `policy`
  é ecoada (para atribuição) e a validação estrutural ocorre no `validate()`. Conformidade de cadeia
  exige trust store (ACT root) — ver `signer/app/providers/icp_brasil.py` + `trust_anchors`.

## Persistência: TimestampRecord

`api/app/models/timestamp_record.py` — registra `provider`, `tsa_name/url`, `serial_number`,
`policy_oid`, `message_imprint_algorithm/imprint`, `gen_time`, `token` (bruto ou `token_ref` de object
storage), `status`, `validation_status`, `validation_details`, `validated_at`.

Relações: `Edition.timestamp_records`, `Signature.timestamp_records`, `Organization.timestamp_records`.

## Estados consistentes

`ValidationStatus` (`api/app/models/enums.py`): `pending_validation | valid | invalid | indeterminate`.
Aplicado tanto a assinatura quanto a timestamp.

## Testes

- `signer/tests/test_timestamp_provider.py` — abstração, digest SHA-256, exige URL, request
  bem-formado, rejeita lixo/estrutura inválida.
