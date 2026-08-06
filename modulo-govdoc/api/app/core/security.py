"""Primitivas de segurança: hash de senha (Argon2id), JWT e tokens externos."""

import hashlib
import hmac
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

from app.core.config import settings

# Argon2id com parâmetros conservadores para servidor de porte médio.
_hasher = PasswordHasher(time_cost=2, memory_cost=64 * 1024, parallelism=2)


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        _hasher.verify(password_hash, password)
        return True
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def needs_rehash(password_hash: str) -> bool:
    try:
        return _hasher.check_needs_rehash(password_hash)
    except Exception:  # pragma: no cover - hash inválido
        return True


def _now() -> datetime:
    return datetime.now(timezone.utc)


def create_access_token(
    subject: str,
    extra: Optional[dict] = None,
    expires_minutes: Optional[int] = None,
    token_type: str = "access",
) -> str:
    """Emite um token do GovDoc.

    `type=access` para sessões técnicas do próprio módulo (testes, ponte dev);
    `type=module_access` para reproduzir o formato do token emitido pela
    plataforma SaaS (SSO), já que a ponte dev assina com a chave do GovDoc.
    """
    expire = _now() + timedelta(
        minutes=expires_minutes or settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload = {
        "sub": str(subject),
        "type": token_type,
        "module": "govdoc",
        "exp": expire,
        "iat": _now(),
        "jti": uuid.uuid4().hex,
    }
    if extra:
        payload.update(extra)
    return jwt.encode(
        payload, settings.SECRET_KEY.get_secret_value(), algorithm=settings.ALGORITHM
    )


def decode_token(token: str) -> dict:
    """Decodifica um token emitido pelo GovDoc; cai para o segredo do SaaS
    quando o login vem da plataforma (single sign-on entre módulos)."""
    try:
        return jwt.decode(
            token, settings.SECRET_KEY.get_secret_value(), algorithms=[settings.ALGORITHM]
        )
    except jwt.PyJWTError:
        saas_secret = settings.SAAS_JWT_SECRET.get_secret_value()
        if not saas_secret:
            raise
        return jwt.decode(token, saas_secret, algorithms=[settings.ALGORITHM])


def generate_refresh_token() -> tuple[str, str]:
    """Retorna (token em claro, hash para o banco)."""
    raw = secrets.token_urlsafe(48)
    return raw, sha256_hex(raw)


def generate_external_token() -> tuple[str, str, str]:
    """Token de link externo: 256 bits de entropia.

    Retorna (token em claro, hash, prefixo). Só o hash e o prefixo (para exibir
    "…abc123" na interface) vão para o banco.
    """
    raw = secrets.token_urlsafe(32)
    return raw, sha256_hex(raw), raw[:8]


def sha256_hex(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def hash_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def constant_time_equals(a: str, b: str) -> bool:
    return hmac.compare_digest(a, b)


def generate_numeric_code(digits: int = 6) -> str:
    return "".join(secrets.choice("0123456789") for _ in range(digits))


def generate_temp_password() -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"
    return "".join(secrets.choice(alphabet) for _ in range(14))
