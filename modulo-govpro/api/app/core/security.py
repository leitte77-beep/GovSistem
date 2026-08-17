import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from app.core.config import settings


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


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


def create_citizen_token(
    user_id: uuid.UUID,
    tenant_id: uuid.UUID,
    expires_minutes: int | None = None,
) -> str:
    """Token de sessão do cidadão (área externa), distinto do token interno/SSO."""
    now = datetime.now(timezone.utc)
    exp_min = expires_minutes or settings.ACCESS_TOKEN_EXPIRE_MINUTES
    payload = {
        "sub": str(user_id),
        "type": "citizen",
        "tenant_id": str(tenant_id),
        "iat": now,
        "exp": now + timedelta(minutes=exp_min),
    }
    return jwt.encode(payload, settings.SECRET_KEY.get_secret_value(), algorithm=settings.ALGORITHM)


def decode_token(token: str) -> dict:
    """Valida o token contra a LISTA de segredos (local + chaves do SaaS).

    Espelha o ChatGov (`verifyToken`): tenta cada segredo até um validar. Assim o
    mesmo token emitido pela plataforma SaaS é aceito aqui, sem reimplementar login.
    """
    last_error: Exception | None = None
    for secret in settings.jwt_secrets:
        try:
            return jwt.decode(token, secret, algorithms=[settings.ALGORITHM])
        except jwt.InvalidTokenError as exc:  # noqa: PERF203
            last_error = exc
    raise last_error or jwt.InvalidTokenError("Invalid token")
