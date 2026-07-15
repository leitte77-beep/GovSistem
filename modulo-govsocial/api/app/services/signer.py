"""Servico de integracao com o Signer para assinatura digital ICP-Brasil (Fase 3.13)."""

import base64
import hashlib
import logging
from datetime import datetime, timezone
from typing import Optional

import httpx

from app.core.config import settings

logger = logging.getLogger("govsocial.signer")

SIGNER_URL = getattr(settings, "SIGNER_URL", "http://signer:8100")
INTERNAL_API_KEY = settings.INTERNAL_API_KEY.get_secret_value()


async def sign_pdf(
    unsigned_pdf_bytes: bytes,
    pfx_base64: str,
    pfx_password: str,
    document_id: str,
    reason: str = "Assinatura Digital - Atendimento SUAS ICP-Brasil AD-RB",
    location: str = "",
) -> dict:
    """Assina um PDF usando o servico Signer (PAdES AD-RB)."""
    sha_original = hashlib.sha256(unsigned_pdf_bytes).hexdigest()
    verification_code = sha_original[:12].upper()
    payload = {
        "edition_id": document_id,
        "unsigned_pdf_base64": base64.b64encode(unsigned_pdf_bytes).decode("utf-8"),
        "pfx_base64": pfx_base64,
        "pfx_password": pfx_password,
        "reason": reason,
        "location": location,
        "visible": False,
        "verification_code": verification_code,
    }
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            f"{SIGNER_URL}/internal/sign-pdf",
            json=payload,
            headers={"X-Internal-API-Key": INTERNAL_API_KEY},
        )
        resp.raise_for_status()
        result = resp.json()

    signed_pdf_bytes = base64.b64decode(result["signed_pdf_base64"])
    result["signed_pdf_bytes"] = signed_pdf_bytes
    result["sha256_original"] = sha_original
    return result


async def verify_pdf(signed_pdf_bytes: bytes) -> dict:
    """Verifica a assinatura de um PDF assinado."""
    payload = {"signed_pdf_base64": base64.b64encode(signed_pdf_bytes).decode("utf-8")}
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{SIGNER_URL}/internal/verify-pdf",
            json=payload,
            headers={"X-Internal-API-Key": INTERNAL_API_KEY},
        )
        resp.raise_for_status()
        return resp.json()


async def inspect_certificate(pfx_base64: str, password: str) -> dict:
    """Valida um certificado antes de armazenar."""
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{SIGNER_URL}/internal/certificates/inspect",
            data={"pfx_base64": pfx_base64, "password": password},
            headers={"X-Internal-API-Key": INTERNAL_API_KEY},
        )
        resp.raise_for_status()
        return resp.json()
