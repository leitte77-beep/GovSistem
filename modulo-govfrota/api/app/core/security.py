import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from app.core.config import settings


def hash_secret(secret: str) -> str:
    """Hash de senha/PIN (bcrypt). Nunca armazenar em texto puro."""
    return bcrypt.hashpw(secret.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_secret(secret: str, secret_hash: str) -> bool:
    try:
        return bcrypt.checkpw(secret.encode("utf-8"), secret_hash.encode("utf-8"))
    except ValueError:
        return False


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
    return jwt.encode(payload, settings.SECRET_KEY.get_secret_value(), algorithm=settings.ALGORITHM)


def create_driver_token(
    motorista_id: uuid.UUID,
    credential_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(motorista_id),
        "cred": str(credential_id),
        "org": str(organization_id),
        "type": "driver_access",
        "module": "govfrota",
        "iat": now,
        "exp": now + timedelta(minutes=settings.DRIVER_TOKEN_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, settings.SECRET_KEY.get_secret_value(), algorithm=settings.ALGORITHM)


def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.SECRET_KEY.get_secret_value(), algorithms=[settings.ALGORITHM])


def decode_saas_token(token: str) -> dict | None:
    saas_secret = settings.SAAS_JWT_SECRET.get_secret_value()
    if not saas_secret:
        return None
    try:
        return jwt.decode(token, saas_secret, algorithms=[settings.ALGORITHM])
    except Exception:
        return None
