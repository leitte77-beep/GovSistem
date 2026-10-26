"""Primitivas de segurança: bcrypt, JWT, HMAC e mascaramento."""

from __future__ import annotations

import hashlib
import hmac
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from app.core.config import settings


def hash_password(password: str) -> str:
    """Gera hash bcrypt com custo 12 (B.12-051)."""
    raw = password.encode("utf-8")
    if len(raw) > 72:
        raise ValueError("A senha excede o limite técnico de 72 bytes do bcrypt.")
    return bcrypt.hashpw(raw, bcrypt.gensalt(rounds=12)).decode("utf-8")


def verify_password(password: str, password_hash: str | None) -> bool:
    if not password_hash:
        return False
    raw = password.encode("utf-8")
    if len(raw) > 72:
        return False
    try:
        return bcrypt.checkpw(raw, password_hash.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def agora() -> datetime:
    return datetime.now(timezone.utc)


def create_access_token(
    subject: str | uuid.UUID,
    *,
    tenant_id: str | uuid.UUID | None = None,
    roles: list[str] | None = None,
    token_version: int = 1,
    token_type: str = "access",
    module: str = "govsaude",
    expires_minutes: int | None = None,
    extra: dict | None = None,
) -> str:
    """Emite JWT HS256 no mesmo formato aceito pela plataforma.

    ``type=access`` é o token local (fallback de login). ``type=module_access``
    reproduz o token emitido pela saas-platform no SSO.
    """
    emitido = agora()
    payload: dict = {
        "sub": str(subject),
        "type": token_type,
        "module": module,
        "iss": settings.JWT_ISSUER,
        "iat": emitido,
        "exp": emitido
        + timedelta(minutes=expires_minutes or settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        "jti": uuid.uuid4().hex,
        "ver": token_version,
    }
    if tenant_id:
        payload["organization_id"] = str(tenant_id)
        payload["tenant_id"] = str(tenant_id)
    if roles is not None:
        payload["roles"] = list(roles)
    if extra:
        payload.update(extra)
    return jwt.encode(
        payload,
        settings.SECRET_KEY.get_secret_value(),
        algorithm=settings.ALGORITHM,
    )


def create_refresh_token(
    subject: str | uuid.UUID, *, tenant_id: str | uuid.UUID, token_version: int = 1
) -> str:
    emitido = agora()
    payload = {
        "sub": str(subject),
        "organization_id": str(tenant_id),
        "type": "refresh",
        "ver": token_version,
        "iss": settings.JWT_ISSUER,
        "iat": emitido,
        "exp": emitido + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        "jti": uuid.uuid4().hex,
    }
    return jwt.encode(
        payload,
        settings.SECRET_KEY.get_secret_value(),
        algorithm=settings.ALGORITHM,
    )


def decode_token(token: str) -> dict:
    """Decodifica token local e, se necessário, token emitido pelo SaaS."""
    try:
        return jwt.decode(
            token,
            settings.SECRET_KEY.get_secret_value(),
            algorithms=[settings.ALGORITHM],
        )
    except jwt.PyJWTError:
        saas_secret = settings.SAAS_JWT_SECRET.get_secret_value()
        if not saas_secret:
            raise
        return jwt.decode(token, saas_secret, algorithms=[settings.ALGORITHM])


def sha256_hex(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def hash_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def hmac_hex(value: str, *, key: bytes | None = None) -> str:
    chave = key or settings.cpf_hmac_key
    return hmac.new(chave, value.encode("utf-8"), hashlib.sha256).hexdigest()


def constant_time_equals(a: str, b: str) -> bool:
    return hmac.compare_digest(a, b)


def token_opaco() -> str:
    return secrets.token_urlsafe(32)


def mascarar_documento(valor: str | None) -> str | None:
    digitos = "".join(ch for ch in (valor or "") if ch.isalnum())
    if not digitos:
        return None
    if len(digitos) <= 4:
        return "***"
    return f"***{digitos[-4:]}"


def mascarar_nome(nome: str | None) -> str | None:
    if not nome:
        return None
    partes = [p for p in nome.strip().split() if p]
    if len(partes) == 1:
        return f"{partes[0][0]}***"
    return f"{partes[0]} {' '.join(p[0] + '***' for p in partes[1:])}"


def senha_expira_em(base: datetime | None = None) -> datetime:
    return (base or agora()) + timedelta(days=settings.PASSWORD_EXPIRE_DAYS)
