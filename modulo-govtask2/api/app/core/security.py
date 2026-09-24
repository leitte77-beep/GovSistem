import uuid
from datetime import datetime, timedelta, timezone

import jwt

from app.core.config import settings


def create_access_token(
    user_id: uuid.UUID,
    roles: list[str],
    organization_id: uuid.UUID | None = None,
) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "roles": roles,
        "type": "access",
        "iat": now,
        "exp": now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        "organization_id": str(organization_id) if organization_id else None,
    }
    return jwt.encode(
        payload, settings.SECRET_KEY.get_secret_value(), algorithm=settings.ALGORITHM
    )


def decode_token(token: str) -> dict:
    return jwt.decode(
        token, settings.SECRET_KEY.get_secret_value(), algorithms=[settings.ALGORITHM]
    )


def decode_saas_token(token: str) -> dict | None:
    """Token de SSO emitido pela plataforma GovSistem (`module_access`)."""
    saas_secret = settings.SAAS_JWT_SECRET.get_secret_value()
    if not saas_secret:
        return None
    try:
        return jwt.decode(token, saas_secret, algorithms=[settings.ALGORITHM])
    except Exception:
        return None
