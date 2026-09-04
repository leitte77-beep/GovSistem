"""Encryption service for sensitive data at rest.

Uses the versioned :class:`FernetKeyRing` from :mod:`app.services.secrets`.
Every ciphertext is tagged with its ``encryption_key_id`` so keys can be
rotated without re-encrypting existing material. Legacy Fernet payloads
(no ``v1.<key_id>.`` prefix) are transparently decrypted with the active
key for backward compatibility.
"""

from __future__ import annotations

import logging
from functools import lru_cache

from app.core.config import settings
from app.services.secrets import FernetKeyRing, seal, unseal

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def get_key_ring() -> FernetKeyRing:
    """Build the process-level key ring from the master SECRET_KEY.

    A single active key ("v1") is used by default. Future key rotation can
    pass additional ``ENC_KEYS_*`` configurations; the ring already supports
    multiple versions and key_id tagging.
    """
    master = settings.SECRET_KEY.get_secret_value()
    versions: dict[str, str] = {}
    for i in range(1, 6):
        segment = getattr(settings, f"ENC_KEY_V{i}", None)
        if segment:
            versions[f"v{i}"] = segment
    if not versions:
        versions = {"v1": master}
    return FernetKeyRing(master_key=master, key_versions=versions)


def _ring() -> FernetKeyRing:
    return get_key_ring()


def encrypt(plaintext: str) -> str:
    """Encrypt a string. Returns a versioned, base64-encoded ciphertext string."""
    return seal(plaintext.encode("utf-8"), _ring())


def decrypt(ciphertext: str) -> str:
    """Decrypt a versioned (or legacy) ciphertext string."""
    return unseal(ciphertext, _ring()).decode("utf-8")


def encrypt_bytes(data: bytes) -> bytes:
    """Encrypt raw bytes. Returns the versioned, base64-encoded bytes."""
    return seal(data, _ring()).encode("utf-8")


def decrypt_bytes(data: bytes) -> bytes:
    """Decrypt raw bytes (versioned or legacy)."""
    return unseal(data.decode("utf-8"), _ring())


def current_key_id() -> str:
    """Return the active encryption key id for auditing/rotation."""
    return _ring().active_key_id
