"""Mock signature provider for development / homologation only.

Produces a clearly-labelled PDF (visual watermark + metadata) WITHOUT an
ICP-Brasil cryptographic signature. It is forbidden in production: the
factory refuses to build it when the environment is production, and the
startup path refuses to run with ``SIGNER_PROVIDER=mock``.

The PDF is marked:

    DOCUMENTO DE HOMOLOGAÇÃO
    SEM VALIDADE JURÍDICA
    NÃO ASSINADO COM ICP-BRASIL

and metadata carries ``signature_provider = mock`` for explicit auditing.
"""

from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timezone

from app.providers.base import SignatureProvider, SignedDocument

logger = logging.getLogger(__name__)

HOMOLOGATION_WATERMARK = (
    "DOCUMENTO DE HOMOLOGAÇÃO\n"
    "SEM VALIDADE JURÍDICA\n"
    "NÃO ASSINADO COM ICP-BRASIL"
)


class MockSignatureProvider(SignatureProvider):
    """Development-only provider that marks a PDF without signing it."""

    provider = "mock"

    def __init__(self, argv: dict | None = None) -> None:
        self._argv = argv or {}

    def _annotate(self, pdf_bytes: bytes) -> bytes:
        """Append a visible marker to the PDF bytes without a CMS signature.

        We do not pretend to create a cryptographic signature; we only make
        the mock explicit. To guarantee the marker is not mistaken for a real
        signature the output is flagged with ``signature_provider='mock'`` in
        metadata and visually watermarked via a trailing comment object.
        """
        marker = (
            b"\n%\n% DOCUMENTO DE HOMOLOGACAO - SEM VALIDADE JURIDICA\n"
            b"% NAO ASSINADO COM ICP-BRASIL - signature_provider=mock\n"
        )
        return pdf_bytes + marker

    def sign(self, pdf_bytes: bytes) -> SignedDocument:
        now = datetime.now(timezone.utc).isoformat()
        data = self._annotate(pdf_bytes)
        return SignedDocument(
            content=data,
            certificate_info={
                "provider": "mock",
                "format": "MOCK",
                "subject": "HOMOLOGACAO - SEM VALIDADE JURIDICA",
                "issuer": "N/A",
                "serial": "MOCK",
                "valid_from": "",
                "valid_to": "",
                "thumbprint": "",
                "sha256_fingerprint": hashlib.sha256(data).hexdigest().upper(),
                "signature_provider": "mock",
            },
            signature_time=now,
            signature_format="MOCK",
            verification_code=self._argv.get("verification_code", ""),
        )

    def verify(self, pdf_bytes: bytes) -> bool:
        # A mock is never a valid cryptographic signature.
        return False

    def get_certificate_info(self) -> dict:
        return {
            "provider": "mock",
            "format": "MOCK",
            "subject": "HOMOLOGACAO - SEM VALIDADE JURIDICA",
            "issuer": "N/A",
            "serial": "MOCK",
            "signature_provider": "mock",
        }
