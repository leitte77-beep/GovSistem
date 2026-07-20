"""Internal signing endpoint - protected, not exposed to public.

Implements ICP-Brasil PAdES AD-RB signing flow:
1. Load and validate A1 certificate
2. Sign PDF with proper PAdES parameters
3. Verify signature locally
4. Register audit trail
"""

import base64
import hashlib
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Header, UploadFile, File, Form
from pydantic import BaseModel

from app.core.config import settings
from app.providers import create_provider

logger = logging.getLogger(__name__)
router = APIRouter(tags=["internal"])

_audit_log: list[dict] = []


def _verify_internal_api_key(x_internal_api_key: str = Header(...)) -> None:
    """Verify that the request comes from an authorized internal service."""
    expected = settings.INTERNAL_API_KEY.get_secret_value()
    if not expected:
        if settings.LOG_LEVEL == "DEBUG":
            return
        raise HTTPException(status_code=500, detail="Internal API key not configured")
    if x_internal_api_key != expected:
        raise HTTPException(status_code=403, detail="Forbidden: invalid internal API key")


def _sanitize_log(record: dict) -> dict:
    safe = {k: v for k, v in record.items() if k not in ("pfx_password", "pfx_base64")}
    if "pfx_base64" in safe:
        safe["pfx_base64"] = f"<{len(safe['pfx_base64'])} bytes>"
    return safe


# ── Schemas ───────────────────────────────────────────────────────────────────


class InternalSignRequest(BaseModel):
    edition_id: str
    unsigned_pdf_base64: str
    pfx_base64: str
    pfx_password: str
    reason: str = "Assinatura Digital - Doe ICP-Brasil AD-RB"
    location: str = ""
    visible: bool = False
    verification_code: str = ""


class SignResponse(BaseModel):
    signed_pdf_base64: str
    sha256_signed: str
    sha256_original: str
    certificate_subject: str
    certificate_serial: str
    certificate_thumbprint: str
    certificate_issuer: str
    valid_from: str
    valid_to: str
    policy_oid: str
    signature_format: str
    signed_at: str
    validation_status: str
    verification_code: str = ""


class InspectResponse(BaseModel):
    subject: str
    issuer: str
    serial_number: str
    valid_from: str
    valid_until: str
    is_a1: bool
    days_remaining: int
    sha256_fingerprint: str
    public_key_algorithm: str
    key_size: int
    policy_oids: list[str]


class VerifyRequest(BaseModel):
    signed_pdf_base64: str


class VerifySignatureInfo(BaseModel):
    name: str
    filter: str
    subfilter: str
    reason: str
    location: str
    signing_time: str
    byte_range: list[int]
    format_ok: bool


class VerifyResponse(BaseModel):
    valid: bool
    signatures: list[VerifySignatureInfo]
    errors: list[str]
    warnings: list[str]


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.post("/internal/certificates/inspect", response_model=InspectResponse)
async def inspect_certificate(
    pfx_base64: str = Form(...),
    password: str = Form(...),
    _auth: None = Depends(_verify_internal_api_key),
):
    """Inspect an A1 certificate and return detailed information with ICP-Brasil validation."""
    try:
        pfx_bytes = base64.b64decode(pfx_base64)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid base64: {e}")

    try:
        provider = create_provider("a1", pfx_bytes=pfx_bytes, password=password)
        info = provider.inspect()
        icp = provider.validate_icp_brasil()
    except Exception as e:
        logger.error("Failed to inspect certificate: %s", e)
        raise HTTPException(status_code=400, detail=f"Failed to load certificate: {e}")

    return InspectResponse(
        subject=info.subject,
        issuer=info.issuer,
        serial_number=info.serial_number,
        valid_from=info.valid_from,
        valid_until=info.valid_until,
        is_a1=info.is_a1,
        days_remaining=info.days_remaining,
        sha256_fingerprint=info.sha256_fingerprint,
        public_key_algorithm=info.public_key_algorithm,
        key_size=info.key_size,
        policy_oids=info.policy_oids,
    )


@router.post("/internal/sign-pdf", response_model=SignResponse)
async def sign_pdf(
    request: InternalSignRequest,
    _auth: None = Depends(_verify_internal_api_key),
):
    """Sign a PDF with an A1 certificate using PAdES AD-RB (ICP-Brasil)."""

    logger.info(
        "Signing request: edition_id=%s reason='%s' visible=%s",
        request.edition_id, request.reason, request.visible,
    )

    try:
        pfx_bytes = base64.b64decode(request.pfx_base64)
        pdf_bytes = base64.b64decode(request.unsigned_pdf_base64)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid base64: {e}")

    sha256_original = hashlib.sha256(pdf_bytes).hexdigest()

    try:
        provider = create_provider(
            "a1", pfx_bytes=pfx_bytes, password=request.pfx_password,
        )
    except Exception as e:
        logger.error("Failed to load PFX for edition_id=%s", request.edition_id)
        raise HTTPException(status_code=400, detail=f"Failed to load certificate: {e}")

    # Validate certificate
    insp = provider.inspect()
    if insp.days_remaining < 0:
        raise HTTPException(status_code=422, detail=f"Certificado vencido há {abs(insp.days_remaining)} dias")

    try:
        result = provider.sign(
            pdf_bytes,
            visible=request.visible,
            reason=request.reason or "Assinatura Digital - Doe ICP-Brasil AD-RB",
            location=request.location or "",
            verification_code=request.verification_code,
        )
    except Exception as e:
        logger.error("Signing failed for edition_id=%s: %s", request.edition_id, e)
        raise HTTPException(status_code=500, detail=f"Signing failed: {e}")

    signed_b64 = base64.b64encode(result.content).decode("utf-8")
    sha256_signed = hashlib.sha256(result.content).hexdigest()
    now = datetime.now(timezone.utc).isoformat()
    ci = result.certificate_info

    # Local verification
    try:
        ver = provider.verify(result.content)
        val_status = "ok" if ver else "verification_failed"
    except Exception:
        val_status = "verification_error"

    audit_entry = {
        "edition_id": request.edition_id,
        "sha256_original": sha256_original,
        "sha256_signed": sha256_signed,
        "certificate_subject": ci["subject"],
        "certificate_serial": ci["serial"],
        "signed_at": now,
        "validation_status": val_status,
    }
    _audit_log.append(audit_entry)
    logger.info("Signing complete: edition_id=%s sha256=%s status=%s", request.edition_id, sha256_signed, val_status)

    return SignResponse(
        signed_pdf_base64=signed_b64,
        sha256_signed=sha256_signed,
        sha256_original=sha256_original,
        certificate_subject=ci["subject"],
        certificate_serial=ci["serial"],
        certificate_thumbprint=ci.get("thumbprint", ""),
        certificate_issuer=ci.get("issuer", ""),
        valid_from=ci.get("valid_from", ""),
        valid_to=ci.get("valid_to", ""),
        policy_oid=ci.get("policy_oid", "2.16.76.1.7.1.11.1.3"),
        signature_format=result.signature_format,
        signed_at=now,
        validation_status=val_status,
        verification_code=result.verification_code,
    )


@router.post("/internal/verify-pdf", response_model=VerifyResponse)
async def verify_pdf_signature(
    request: VerifyRequest,
    _auth: None = Depends(_verify_internal_api_key),
):
    """Verify a signed PDF and return detailed validation report."""
    try:
        pdf_bytes = base64.b64decode(request.signed_pdf_base64)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid base64: {e}")

    try:
        from app.providers.a1 import PfxA1SignerProvider
        dummy = PfxA1SignerProvider.__new__(PfxA1SignerProvider)
        result = dummy.verify_detailed(pdf_bytes)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Verification failed: {e}")

    return VerifyResponse(
        valid=result["valid"],
        signatures=[VerifySignatureInfo(**s) for s in result["signatures"]],
        errors=result["errors"],
        warnings=result["warnings"],
    )
