"""Adaptador ICP-Brasil — assinatura qualificada (Lei 14.063/2020).

Implementa assinatura CAdES (CMS/PKCS#7 detached) com certificado digital A1/A3
(PKCS#12) e carimbo de tempo (RFC 3161) em autoridade configurável, isolado atrás
de uma interface e com resiliência (timeout/retry/circuit breaker/fallback).

- Sem ICP_TSA_URL configurado → assina CAdES-BES (sem carimbo), modo degradado.
- Falha na autoridade de carimbo → fallback: assina mesmo assim, sem o T.
"""

import base64
import hashlib
import json
import logging
import os
from dataclasses import asdict, dataclass
from typing import Optional

import httpx
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.serialization import pkcs7, pkcs12

from app.adapters.resilience import CircuitBreaker, resilient_call
from app.core.config import settings

logger = logging.getLogger("govpro.adapters.icp_brasil")

# SHA-256 OID (2.16.840.1.101.3.4.2.1)
_SHA256_OID_DER = bytes.fromhex("0609608648016503040201")


@dataclass
class AssinaturaICPResultado:
    formato: str
    algoritmo: str
    certificado_serial: str
    assinatura_b64: str
    carimbo_b64: Optional[str] = None
    carimbo_aplicado: bool = False
    validacao_resultado: str = "OK"


class ICPBrasilAdapter:
    """Interface estável para assinatura qualificada ICP-Brasil."""

    def assinar(
        self,
        conteudo: bytes,
        *,
        certificado_pfx_base64: str,
        certificado_senha: str,
        formato: str = "CADES",
    ) -> AssinaturaICPResultado: ...

    def carimbar(self, hash_sha256: bytes) -> Optional[str]: ...


# ── DER mínimo para TimeStampReq (RFC 3161) ────────────────────────────────


def _der_length(n: int) -> bytes:
    if n < 0x80:
        return bytes([n])
    data = n.to_bytes((n.bit_length() + 7) // 8, "big")
    return bytes([0x80 | len(data)]) + data


def _der_tlv(tag: int, content: bytes) -> bytes:
    return bytes([tag]) + _der_length(len(content)) + content


def _der_integer(value: int) -> bytes:
    if value == 0:
        data = b"\x00"
    else:
        data = value.to_bytes((value.bit_length() + 7) // 8, "big")
        if data[0] & 0x80:
            data = b"\x00" + data
    return _der_tlv(0x02, data)


def _der_octet_string(data: bytes) -> bytes:
    return _der_tlv(0x04, data)


def _der_boolean(value: bool) -> bytes:
    return _der_tlv(0x01, b"\xff" if value else b"\x00")


def _der_sequence(*items: bytes) -> bytes:
    return _der_tlv(0x30, b"".join(items))


def _der_oid() -> bytes:
    return _SHA256_OID_DER


def _der_null() -> bytes:
    return b"\x05\x00"


def _build_timestamp_request(message_hash: bytes) -> bytes:
    """Constrói um TimeStampReq (RFC 3161) DER para SHA-256."""
    algorithm_identifier = _der_sequence(_der_oid(), _der_null())
    message_imprint = _der_sequence(algorithm_identifier, _der_octet_string(message_hash))
    nonce = _der_integer(int.from_bytes(os.urandom(8), "big"))
    return _der_sequence(
        _der_integer(1),  # version
        message_imprint,
        nonce,
        _der_boolean(True),  # certReq
    )


def _status_do_timestamp_response(resp_der: bytes) -> Optional[int]:
    """Extrai o status (PKIStatus) do TimeStampResp (0 = granted)."""
    try:
        # TimeStampResp ::= SEQUENCE { status PKIStatusInfo, ... }
        if not resp_der or resp_der[0] != 0x30:
            return None
        # status é o primeiro item da sequência (PKIStatus ::= INTEGER).
        if resp_der[1] & 0x80:
            raise ValueError("DER longo inesperado")
        inner = resp_der[2:2 + resp_der[1]]
        # inner[0] == 0x30 (PKIStatusInfo), status INTEGER dentro.
        if inner[0] != 0x30:
            return None
        status_tlv = inner[2:]
        if status_tlv[0] != 0x02:
            return None
        status_len = status_tlv[1]
        return int.from_bytes(status_tlv[2:2 + status_len], "big")
    except Exception:  # noqa: BLE001
        return None


# ── Implementação criptográfica + carimbo ──────────────────────────────────

_tsa_breaker = CircuitBreaker(
    threshold=settings.ICP_TSA_CIRCUIT_BREAKER_THRESHOLD,
    cooldown_s=settings.ICP_TSA_CIRCUIT_BREAKER_COOLDOWN_S,
)


class ICPBrasilCriptografiaAdapter(ICPBrasilAdapter):
    """Assinatura qualificada local (cryptography) + carimbo de tempo via TSA."""

    def assinar(
        self,
        conteudo: bytes,
        *,
        certificado_pfx_base64: str,
        certificado_senha: str,
        formato: str = "CADES",
    ) -> AssinaturaICPResultado:
        formato = formato.upper()
        if formato not in ("CADES", "PADES"):
            raise ValueError("formato deve ser CADES ou PADES")

        pfx = base64.b64decode(certificado_pfx_base64)
        private_key, certificado, adicionais = pkcs12.load_key_and_certificates(
            pfx, certificado_senha.encode("utf-8")
        )
        if private_key is None or certificado is None:
            raise ValueError("PKCS#12 sem chave privada ou certificado")

        builder = (
            pkcs7.PKCS7SignatureBuilder()
            .set_data(conteudo)
            .add_signer(certificado, private_key, hashes.SHA256())
        )
        for extra in adicionais or []:
            builder = builder.add_certificate(extra)

        opcoes = [
            pkcs7.PKCS7Options.DetachedSignature,
            pkcs7.PKCS7Options.NoCapabilities,
        ]
        assinatura_der = builder.sign(serialization.Encoding.DER, opcoes)

        digest = hashlib.sha256(conteudo).digest()
        carimbo_b64 = self.carimbar(digest)

        resultado = AssinaturaICPResultado(
            formato=formato,
            algoritmo=f"{formato}-SHA256",
            certificado_serial=str(certificado.serial_number),
            assinatura_b64=base64.b64encode(assinatura_der).decode("ascii"),
            carimbo_b64=carimbo_b64,
            carimbo_aplicado=carimbo_b64 is not None,
            validacao_resultado="OK" if carimbo_b64 else "OK_SEM_CARIMBO",
        )
        logger.info(
            "Assinatura %s: cert serial=%s carimbo=%s",
            formato,
            resultado.certificado_serial,
            resultado.carimbo_aplicado,
        )
        return resultado

    def carimbar(self, hash_sha256: bytes) -> Optional[str]:
        tsa_url = settings.ICP_TSA_URL
        if not tsa_url:
            return None

        requisicao = _build_timestamp_request(hash_sha256)

        async def _post() -> Optional[str]:
            async with httpx.AsyncClient(
                timeout=settings.ICP_TSA_TIMEOUT_S
            ) as client:
                resp = await client.post(
                    tsa_url,
                    content=requisicao,
                    headers={"Content-Type": "application/timestamp-query"},
                )
                resp.raise_for_status()
                status = _status_do_timestamp_response(resp.content)
                if status != 0:
                    raise RuntimeError(f"TSA status != granted: {status}")
                return base64.b64encode(resp.content).decode("ascii")

        return _run_carimbo(_post)


def _run_carimbo(fn) -> Optional[str]:
    """Executa o carimbo com resiliência; em falha aplica fallback (sem carimbo)."""
    import asyncio

    async def _wrap():
        return await resilient_call(
            fn,
            retries=settings.ICP_TSA_RETRIES,
            base_delay_s=0.5,
            breaker=_tsa_breaker,
            fallback=lambda: None,
            on_error=lambda exc, attempt: logger.warning(
                "Carimbo de tempo falhou (tentativa %d): %s", attempt + 1, exc
            ),
        )

    try:
        return asyncio.run(_wrap())
    except Exception as exc:  # noqa: BLE001
        logger.warning("Carimbo de tempo indisponível: %s", exc)
        return None


def serializar_resultado(resultado: AssinaturaICPResultado) -> str:
    """Serializa o artefato de assinatura num envelope base64 (coluna assinatura_b64)."""
    envelope = json.dumps(asdict(resultado), ensure_ascii=True)
    return base64.b64encode(envelope.encode("utf-8")).decode("ascii")


__all__ = [
    "ICPBrasilAdapter",
    "ICPBrasilCriptografiaAdapter",
    "AssinaturaICPResultado",
    "serializar_resultado",
    "_build_timestamp_request",
    "_status_do_timestamp_response",
]
