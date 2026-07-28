"""Criptografia em nível de coluna/aplicação para campos sensíveis (LGPD art. 11)."""

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings


def _derive_key() -> bytes:
    configured = settings.FIELD_ENCRYPTION_KEY.get_secret_value()
    if configured:
        # Aceita chave Fernet pronta (44 chars urlsafe base64) ou material bruto.
        try:
            Fernet(configured.encode())
            return configured.encode()
        except Exception:
            raw = configured.encode()
    else:
        raw = settings.SECRET_KEY.get_secret_value().encode()
    digest = hashlib.sha256(raw).digest()
    return base64.urlsafe_b64encode(digest)


_fernet = Fernet(_derive_key())


def encrypt_text(plaintext: str | None) -> str | None:
    if plaintext is None:
        return None
    return _fernet.encrypt(plaintext.encode("utf-8")).decode("utf-8")


def decrypt_text(token: str | None) -> str | None:
    if token is None:
        return None
    try:
        return _fernet.decrypt(token.encode("utf-8")).decode("utf-8")
    except InvalidToken:
        return None
