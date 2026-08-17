"""Primitivas de segurança: hash de senha, JWT, hashes de arquivo."""

import hashlib
import hmac
import uuid
from datetime import datetime, timedelta, timezone

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

from app.core.config import settings

_hasher = PasswordHasher(time_cost=2, memory_cost=64 * 1024, parallelism=2)


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        _hasher.verify(password_hash, password)
        return True
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def _now() -> datetime:
    return datetime.now(timezone.utc)


def create_access_token(
    subject: str,
    extra: dict | None = None,
    expires_minutes: int | None = None,
    token_type: str = "access",
) -> str:
    """Emite um token do GovCompras.

    `type=access` para sessões técnicas do próprio módulo (testes e a ponte de
    login de demonstração); `type=module_access` reproduz o formato emitido
    pela plataforma GovSistem no login único.
    """
    expire = _now() + timedelta(minutes=expires_minutes or settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": str(subject),
        "type": token_type,
        "module": "govcompras",
        "exp": expire,
        "iat": _now(),
        "jti": uuid.uuid4().hex,
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.SECRET_KEY.get_secret_value(), algorithm=settings.ALGORITHM)


def decode_token(token: str) -> dict:
    """Decodifica token do GovCompras; cai para o segredo do SaaS quando o
    login vem da plataforma central (login único entre módulos)."""
    try:
        return jwt.decode(
            token, settings.SECRET_KEY.get_secret_value(), algorithms=[settings.ALGORITHM]
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


def constant_time_equals(a: str, b: str) -> bool:
    return hmac.compare_digest(a, b)
