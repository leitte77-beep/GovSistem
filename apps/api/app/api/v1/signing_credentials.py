import base64
import hashlib
import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user, require_roles
from app.core.database import get_db
from app.models.signing_credential import SigningCredential
from app.models.user import User
from app.schemas.signing_credential import SigningCredentialOut

router = APIRouter(
    tags=["signing-credentials"],
    dependencies=[Depends(require_roles("ADMIN"))],
)

logger = logging.getLogger(__name__)


@router.post("/signing-credentials/inspect")
async def inspect_credential(
    password: str = Form(...),
    file: UploadFile = File(...),
):
    """Inspect a PFX certificate without storing it. Returns certificate details."""
    pfx_bytes = await file.read()
    if not pfx_bytes:
        raise HTTPException(400, "Arquivo vazio")

    try:
        from cryptography.hazmat.primitives.serialization import pkcs12
        key, cert, ca_certs = pkcs12.load_key_and_certificates(pfx_bytes, password.encode("utf-8"))
    except Exception:
        logger.warning("Failed to load PFX certificate for inspection", exc_info=True)
        raise HTTPException(400, "Falha ao carregar certificado. Verifique a senha e o arquivo PFX.")

    if cert is None:
        raise HTTPException(400, "Nenhum certificado encontrado no arquivo")

    from cryptography.hazmat.primitives import hashes, serialization as crypto_ser

    pub = cert.public_key()
    try:
        key_size = pub.key_size
        algo = pub.__class__.__name__.replace("PublicKey", "").replace("_", "").upper()
    except Exception:
        logger.warning("Could not determine key_size/algorithm for inspected cert", exc_info=True)
        key_size = 0
        algo = "UNKNOWN"

    subject = cert.subject.rfc4514_string()
    issuer = cert.issuer.rfc4514_string()
    serial = f"{cert.serial_number:x}".upper()

    now = datetime.now(timezone.utc)
    days = (cert.not_valid_after_utc - now).days
    fp = hashlib.sha256(cert.public_bytes(crypto_ser.Encoding.DER)).hexdigest().upper()

    from cryptography.x509 import CertificatePolicies
    policy_oids = []
    try:
        for ext in cert.extensions:
            if isinstance(ext.value, CertificatePolicies):
                for p in ext.value:
                    policy_oids.append(p.policy_identifier.dotted_string)
    except Exception:
        logger.warning("Could not read certificate policy OIDs during inspection", exc_info=True)

    is_a1 = any(oid.startswith("2.16.76.1.2.1.") for oid in policy_oids) or len(policy_oids) == 0

    return {
        "subject": subject,
        "issuer": issuer,
        "serial_number": serial,
        "valid_from": cert.not_valid_before_utc.isoformat(),
        "valid_until": cert.not_valid_after_utc.isoformat(),
        "days_remaining": days,
        "is_a1": is_a1,
        "has_private_key": key is not None,
        "sha256_fingerprint": fp,
        "public_key_algorithm": algo,
        "key_size": key_size,
        "policy_oids": policy_oids,
    }


@router.get("/signing-credentials", response_model=list[SigningCredentialOut])
async def list_credentials(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles("ADMIN")),
):
    result = await db.execute(
        select(SigningCredential)
        .where(SigningCredential.deleted_at.is_(None))
        .order_by(SigningCredential.created_at.desc())
    )
    return result.scalars().all()


@router.get("/signing-credentials/{credential_id}", response_model=SigningCredentialOut)
async def get_credential(
    credential_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles("ADMIN")),
):
    result = await db.execute(
        select(SigningCredential).where(
            SigningCredential.id == credential_id,
            SigningCredential.deleted_at.is_(None),
        )
    )
    credential = result.scalar_one_or_none()
    if credential is None:
        raise HTTPException(status_code=404, detail="Credential not found")
    return credential


@router.post("/signing-credentials", response_model=SigningCredentialOut, status_code=201)
async def upload_credential(
    label: str = Form(...),
    password: str = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ADMIN")),
):
    pfx_bytes = await file.read()

    if not pfx_bytes:
        raise HTTPException(400, "Arquivo vazio")

    from app.services.encryption import encrypt_bytes, encrypt

    try:
        from cryptography.hazmat.primitives.serialization import pkcs12
        from cryptography.hazmat.primitives import hashes
        key, cert, ca_certs = pkcs12.load_key_and_certificates(pfx_bytes, password.encode("utf-8"))
    except Exception:
        logger.warning("Failed to load PFX certificate for upload", exc_info=True)
        raise HTTPException(400, "Falha ao carregar certificado. Verifique a senha e o arquivo PFX.")

    if cert is None:
        raise HTTPException(400, "Nenhum certificado encontrado no arquivo")

    subject = cert.subject.rfc4514_string()
    issuer = cert.issuer.rfc4514_string()
    serial = f"{cert.serial_number:x}".upper()

    valid_from = cert.not_valid_before_utc
    valid_until = cert.not_valid_after_utc

    config = {
        "pfx_encrypted": encrypt_bytes(pfx_bytes).decode("utf-8"),
        "password_encrypted": encrypt(password),
    }

    credential = SigningCredential(
        organization_id=user.organization_id,
        label=label,
        provider_type="a1",
        config=config,
        certificate_serial=serial,
        certificate_subject=subject,
        certificate_issuer=issuer,
        valid_from=valid_from,
        valid_until=valid_until,
        is_active=True,
    )
    db.add(credential)
    await db.commit()
    await db.refresh(credential)
    return credential


@router.post("/signing-credentials/sign-pdf")
async def sign_pdf(
    credential_id: str = Form(...),
    file: UploadFile = File(...),
    visible: bool = Form(False),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ADMIN")),
):
    """Sign an uploaded PDF using a stored credential. Returns the signed PDF."""
    pdf_bytes = await file.read()
    if not pdf_bytes:
        raise HTTPException(400, "PDF vazio")

    result = await db.execute(
        select(SigningCredential).where(
            SigningCredential.id == credential_id,
            SigningCredential.deleted_at.is_(None),
            SigningCredential.is_active,
        )
    )
    credential = result.scalar_one_or_none()
    if credential is None:
        raise HTTPException(404, "Certificado não encontrado")

    import hashlib as hl
    ts = datetime.now(timezone.utc).timestamp()
    vcode_raw = hl.sha256(f"{credential.certificate_serial or credential.id}{ts}".encode()).hexdigest()[:8].upper()
    vcode = f"{vcode_raw[:4]}-{vcode_raw[4:8]}"

    from app.services.encryption import decrypt_bytes, decrypt

    try:
        pfx_encrypted = credential.config.get("pfx_encrypted", "")
        pfx_bytes = decrypt_bytes(pfx_encrypted.encode("utf-8"))
        pfx_password = decrypt(credential.config.get("password_encrypted", ""))
    except Exception as e:
        raise HTTPException(500, f"Erro ao descriptografar certificado: {e}")

    try:
        import httpx
        from app.core.config import settings

        sha256_original = hashlib.sha256(pdf_bytes).hexdigest()

        signer_payload = {
            "edition_id": f"avulso-{uuid.uuid4().hex[:8]}",
            "unsigned_pdf_base64": base64.b64encode(pdf_bytes).decode("utf-8"),
            "pfx_base64": base64.b64encode(pfx_bytes).decode("utf-8"),
            "pfx_password": pfx_password,
            "reason": "Assinatura Avulsa - DOE ICP-Brasil AD-RB",
            "location": "",
            "visible": visible,
            "verification_code": vcode,
        }

        async with httpx.AsyncClient() as http_client:
            signer_resp = await http_client.post(
                f"{settings.SIGNER_URL}/internal/sign-pdf",
                json=signer_payload,
                timeout=120,
            )

        if signer_resp.status_code != 200:
            raise RuntimeError(f"Signer error: {signer_resp.text}")

        result_data = signer_resp.json()
        signed_bytes = base64.b64decode(result_data["signed_pdf_base64"])

        from fastapi.responses import Response
        filename = f"signed_{file.filename or 'document.pdf'}"

        # Store signing document record
        try:
            from app.models.signing_document import SigningDocument
            doc = SigningDocument(
                edition_id=None,
                filename=filename,
                sha256_original=result_data.get("sha256_original", sha256_original),
                sha256_signed=result_data["sha256_signed"],
                status="signed",
                signed_at=datetime.now(timezone.utc),
                signed_by=user.id,
                certificate_subject=result_data["certificate_subject"],
                certificate_serial=result_data["certificate_serial"],
                verification_code=vcode,
            )
            db.add(doc)
            await db.commit()
        except Exception:
            logger.warning("Failed to store SigningDocument record", exc_info=True)

        return Response(
            content=signed_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "X-SHA256-Original": result_data.get("sha256_original", sha256_original),
                "X-SHA256-Signed": result_data["sha256_signed"],
                "X-Certificate-Subject": result_data["certificate_subject"],
                "X-Signature-Format": result_data.get("signature_format", "PAdES-AD-RB"),
                "X-Verification-Code": vcode,
            },
        )

    except httpx.RequestError as e:
        raise HTTPException(502, f"Serviço de assinatura indisponível: {e}")
    except Exception as e:
        logger.error("Error signing PDF: %s", e, exc_info=True)
        raise HTTPException(500, f"Erro ao assinar: {e}")


@router.delete("/signing-credentials/{credential_id}", status_code=204)
async def delete_credential(
    credential_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles("ADMIN")),
):
    result = await db.execute(
        select(SigningCredential).where(
            SigningCredential.id == credential_id,
            SigningCredential.deleted_at.is_(None),
        )
    )
    credential = result.scalar_one_or_none()
    if credential is None:
        raise HTTPException(status_code=404, detail="Credential not found")

    from datetime import timezone
    credential.deleted_at = datetime.now(timezone.utc)
    credential.is_active = False
    await db.commit()


@router.post("/signing-credentials/verify-pdf")
async def verify_pdf_signature(
    body: dict,
    db: AsyncSession = Depends(get_db),
):
    """Verify a signed PDF using the internal signer service."""
    signed_pdf_base64 = body.get("signed_pdf_base64")
    if not signed_pdf_base64:
        raise HTTPException(400, "signed_pdf_base64 é obrigatório")

    try:
        import httpx
        from app.core.config import settings

        async with httpx.AsyncClient() as http_client:
            resp = await http_client.post(
                f"{settings.SIGNER_URL}/internal/verify-pdf",
                json={"signed_pdf_base64": signed_pdf_base64},
                timeout=60,
            )

        if resp.status_code != 200:
            raise RuntimeError(f"Verifier error: {resp.text}")

        return resp.json()
    except httpx.RequestError as e:
        raise HTTPException(502, f"Serviço de verificação indisponível: {e}")
    except Exception as e:
        logger.error("Error verifying PDF: %s", e, exc_info=True)
        raise HTTPException(500, f"Erro ao verificar: {e}")
