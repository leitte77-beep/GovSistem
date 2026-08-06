"""MFA endpoints: setup, verify, and status."""

import io

import qrcode
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import StreamingResponse

from app.core.auth import get_current_user, require_roles
from app.core.database import get_db
from app.models.user import User
from app.services.mfa import generate_totp_secret, get_totp_uri, verify_totp

router = APIRouter(tags=["mfa"])


@router.post("/mfa/setup")
async def setup_mfa(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ASSINADOR", "ADMIN", "AUDITOR")),
):
    secret = generate_totp_secret()
    totp_uri = get_totp_uri(secret, user.email)

    from app.services.encryption import encrypt
    user.mfa_secret = encrypt(secret)
    user.mfa_enabled = False
    await db.commit()

    return {"secret": secret, "uri": totp_uri, "message": "Scan the QR code with your authenticator app"}


@router.post("/mfa/verify")
async def verify_mfa_setup(
    token: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ASSINADOR", "ADMIN", "AUDITOR")),
):
    if not user.mfa_secret:
        raise HTTPException(status_code=400, detail="MFA not set up")

    from app.services.encryption import decrypt
    secret = decrypt(user.mfa_secret)

    if not verify_totp(secret, token):
        raise HTTPException(status_code=400, detail="Invalid token")

    user.mfa_enabled = True
    await db.commit()

    return {"message": "MFA enabled successfully"}


@router.get("/mfa/qrcode")
async def mfa_qrcode(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ASSINADOR", "ADMIN", "AUDITOR")),
):
    if not user.mfa_secret:
        raise HTTPException(status_code=400, detail="MFA not set up")

    from app.services.encryption import decrypt
    secret = decrypt(user.mfa_secret)
    uri = get_totp_uri(secret, user.email)

    img = qrcode.make(uri)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)

    return StreamingResponse(buf, media_type="image/png")


@router.get("/mfa/status")
async def mfa_status(
    user: User = Depends(get_current_user),
):
    return {"enabled": bool(user.mfa_enabled), "has_secret": bool(user.mfa_secret)}
