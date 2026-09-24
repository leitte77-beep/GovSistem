"""A3 (token / cartão / HSM / PSC em nuvem) signature providers.

A3 private keys never leave the cryptographic device. This module therefore
does **not** try to copy a key to the server. Two orchestration strategies are
provided behind the same ``SignatureProvider`` abstraction:

* ``A3RemoteSignatureProvider`` — bridges signing to a remote PSC/HSM API
  (configured via ``SIGNER_A3_REMOTE_URL``). The remote service performs the
  cryptographic operation after the holder authorises it (PIN/biometric); this
  service only sends the document and validates the result.
* ``A3LocalSignatureProvider`` — documents the desktop scenario: the holder
  signs on their own machine through a PKCS#11 middleware/bridge. Running it
  server-side is refused explicitly instead of silently failing.

Neither provider ever receives or stores a private key.
"""

from __future__ import annotations

import base64
from datetime import datetime, timezone

import httpx

from app.core.config import settings
from app.providers.base import SignatureProvider, SignedDocument


class A3RemoteSignatureProvider(SignatureProvider):
    """Delegates the cryptographic operation to a remote PSC/HSM bridge."""

    def __init__(self, remote_url: str = "", token: str = "", **_ignored):
        self._url = (remote_url or settings.SIGNER_A3_REMOTE_URL or "").rstrip("/")
        self._token = token or settings.SIGNER_A3_REMOTE_TOKEN.get_secret_value()
        if not self._url:
            raise ValueError(
                "A3 remote signing requires SIGNER_A3_REMOTE_URL (PSC/HSM bridge)."
            )
        self._last_certificate_info: dict = {}

    def sign(
        self,
        pdf_bytes: bytes,
        visible: bool = False,
        reason: str = "",
        location: str = "",
        verification_code: str = "",
        **_extra,
    ) -> SignedDocument:
        payload = {
            "unsigned_pdf_base64": base64.b64encode(pdf_bytes).decode("ascii"),
            "reason": reason,
            "location": location,
            "visible": visible,
            "verification_code": verification_code,
        }
        headers = {"Authorization": f"Bearer {self._token}"} if self._token else {}
        resp = httpx.post(
            f"{self._url}/sign-pdf",
            json=payload,
            headers=headers,
            timeout=settings.REVOCATION_TIMEOUT * 6,
        )
        resp.raise_for_status()
        data = resp.json()

        if data.get("validation_status") not in (None, "ok", "valid"):
            raise ValueError(
                f"A3 remote signing failed validation: {data.get('validation_status')}"
            )

        signed = base64.b64decode(data["signed_pdf_base64"])
        self._last_certificate_info = data.get("certificate_info") or {}
        return SignedDocument(
            content=signed,
            certificate_info=self._last_certificate_info,
            signature_time=data.get(
                "signed_at", datetime.now(timezone.utc).isoformat()
            ),
            signature_format=data.get("signature_format", "PAdES-A3"),
            verification_code=verification_code,
        )

    def verify(self, pdf_bytes: bytes) -> bool:
        from app.providers.a1 import PfxA1SignerProvider

        # Reuse the pyHanko-based verification (no private key needed).
        inspector = PfxA1SignerProvider.__new__(PfxA1SignerProvider)
        det = inspector.verify_detailed(pdf_bytes)
        signatures = det.get("signatures", [])
        return bool(
            signatures
            and all(s.get("intact") and s.get("valid") for s in signatures)
        )

    def get_certificate_info(self) -> dict:
        return self._last_certificate_info or {
            "provider": "a3_remote",
            "note": "certificate details are supplied by the remote PSC on signing",
        }


class A3LocalSignatureProvider(SignatureProvider):
    """Desktop A3 signing through local PKCS#11 middleware.

    Server-side use is intentionally unsupported: the token must stay with the
    holder and be unlocked interactively. This class exists so the architecture
    can select A3 without a code rewrite; deployments that need unattended
    signing must use ``a3_remote`` (HSM/PSC) instead.
    """

    def __init__(self, **_ignored):
        pass

    def sign(self, pdf_bytes: bytes, **_extra) -> SignedDocument:
        raise RuntimeError(
            "A3 local signing must happen on the holder's device via PKCS#11 "
            "middleware. Use provider 'a3_remote' (HSM/PSC) for server-side "
            "orchestration; the private key must never reach the server."
        )

    def verify(self, pdf_bytes: bytes) -> bool:
        from app.providers.a1 import PfxA1SignerProvider

        inspector = PfxA1SignerProvider.__new__(PfxA1SignerProvider)
        det = inspector.verify_detailed(pdf_bytes)
        return bool(det.get("signatures")) and all(
            s.get("intact") and s.get("valid") for s in det.get("signatures", [])
        )

    def get_certificate_info(self) -> dict:
        return {
            "provider": "a3_local",
            "note": "certificate resides on the holder's token/middleware",
        }
