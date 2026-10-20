"""Regressão com resposta REAL de uma TSA (Sectigo, gravada em fixture).

Os testes com respostas montadas à mão não pegaram três defeitos que impediam
qualquer carimbo de funcionar: status "granted" lido como recusa, TSTInfo
lido de um dict (sem hora/serial) e validação recusando SHA-384 na assinatura
da própria TSA.
"""

import hashlib
from pathlib import Path

import httpx

from app.providers.timestamp.rfc3161 import Rfc3161TimestampProvider

FIXTURE = Path(__file__).parent / "fixtures" / "tsa_response_sectigo.tsr"
DIGEST = hashlib.sha256(b"diario-oficial-fixture").digest()


def test_real_granted_response_is_accepted_and_parsed(monkeypatch):
    def fake_post(url, content, headers, timeout):
        return httpx.Response(200, content=FIXTURE.read_bytes(), request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx, "post", fake_post)
    provider = Rfc3161TimestampProvider("http://tsa.example")
    result = provider.timestamp(DIGEST)

    assert result.token
    assert result.gen_time.startswith("20")
    assert result.serial_number.isdigit()
    assert result.message_imprint == DIGEST.hex()

    validation = provider.validate(result.token)
    assert validation.valid, validation.errors
    assert validation.status == "VALID"
