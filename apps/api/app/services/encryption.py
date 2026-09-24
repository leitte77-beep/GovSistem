"""Encryption service for sensitive data at rest.

Uses Fernet (symmetric encryption) with a key derived from the master SECRET_KEY.
Supports encrypt/decrypt of strings and bytes for PFX passwords, API keys, etc.
"""

import base64
import hashlib
import logging
from typing import Optional

from cryptography.fernet import Fernet

from app.core.config import settings

logger = logging.getLogger(__name__)

_fernet: Optional[Fernet] = None


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        raw = settings.SECRET_KEY.get_secret_value().encode("utf-8")
        key = base64.urlsafe_b64encode(hashlib.sha256(raw).digest())
        _fernet = Fernet(key)
    return _fernet


def encrypt(plaintext: str) -> str:
    """Encrypt a string. Returns base64-encoded ciphertext."""
    f = _get_fernet()
    return f.encrypt(plaintext.encode("utf-8")).decode("utf-8")


def decrypt(ciphertext: str) -> str:
    """Decrypt a base64-encoded ciphertext."""
    f = _get_fernet()
    return f.decrypt(ciphertext.encode("utf-8")).decode("utf-8")


def encrypt_bytes(data: bytes) -> bytes:
    """Encrypt raw bytes."""
    f = _get_fernet()
    return f.encrypt(data)


def decrypt_bytes(data: bytes) -> bytes:
    """Decrypt raw bytes."""
    f = _get_fernet()
    return f.decrypt(data)
