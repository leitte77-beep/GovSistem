"""Secret provider abstraction and local encrypted backend.

The system must never sprawl raw secret access across the codebase. This
module provides a single, versioned entry point for sensitive configuration
and encrypted-at-rest material, with adapters stubbed for future
Vault / AWS Secrets Manager / Azure Key Vault / GCP Secret Manager.

Runtime key selection
---------------------
Secrets are encrypted with Fernet keys stored in a ``key ring``
(``encryption_keys``) persisted in the database. Every ciphertext is tagged
with the ``encryption_key_id`` used to produce it, so a key can be rotated
(write with the new key, read with the old) without re-encrypting existing
material.

Local ``SecretProvider``
------------------------
``DatabaseSecretProvider`` stores encrypted key/value secrets in the
``app_secrets`` table. Providers implementing ``get_secret`` are used by the
signer-service to retrieve signing material by ``credential_id`` instead of
receiving PFX/password over the wire.
"""

from __future__ import annotations

import abc
import base64
import hashlib
import logging
from dataclasses import dataclass
from datetime import datetime, timezone

from cryptography.fernet import Fernet

logger = logging.getLogger(__name__)

_CIPHER_SUFFIX = "="


@dataclass(slots=True)
class Ciphertext:
    """Encrypted value plus the key identifier used to seal it."""

    ciphertext: bytes
    key_id: str


# ── Key ring ─────────────────────────────────────────────────────────────────


def derivate_fern_key(master: str, key_id: str) -> bytes:
    """Derive a Fernet key deterministically from a master secret + key id."""
    raw = f"{master}:{key_id}".encode("utf-8")
    return base64.urlsafe_b64encode(hashlib.sha256(raw).digest())


class FernetKeyRing:
    """In-memory cache of Fernet keys addressed by ``key_id``.

    ``active_key_id`` is the key used for all new encryptions. Older keys are
    retained for decryption only (rotation safety).
    """

    def __init__(
        self,
        master_key: str,
        key_versions: dict[str, str] | None = None,
        active_key_id: str | None = None,
    ) -> None:
        # key_versions: {key_id: master_segment}; if None, a single "v1" key is used.
        self._master_key = master_key
        if not key_versions:
            self.key_versions = {"v1": master_key}
        else:
            self.key_versions = dict(key_versions)
        self.active_key_id = active_key_id or max(self.key_versions.keys())
        self._cache: dict[str, Fernet] = {}

    def fernet(self, key_id: str | None = None) -> Fernet:
        key_id = key_id or self.active_key_id
        if key_id not in self.key_versions:
            raise ValueError(f"Unknown encryption key id: {key_id}")
        if key_id not in self._cache:
            self._cache[key_id] = Fernet(
                derivate_fern_key(self.key_versions[key_id], key_id)
            )
        return self._cache[key_id]

    def encrypt(self, plaintext: bytes, key_id: str | None = None) -> Ciphertext:
        key_id = key_id or self.active_key_id
        return Ciphertext(self.fernet(key_id).encrypt(plaintext), key_id)

    def decrypt(self, ciphertext: bytes, key_id: str) -> bytes:
        return self.fernet(key_id).decrypt(ciphertext)


# ── Ciphertext (de)serialization ─────────────────────────────────────────────


def seal(data: bytes, ring: FernetKeyRing) -> str:
    """Encrypt ``data`` and return a portable ``v1.<key_id>.<b64>`` string."""
    box = ring.encrypt(data)
    return f"v1.{box.key_id}.{base64.urlsafe_b64encode(box.ciphertext).decode('ascii')}"


def unseal(payload: str, ring: FernetKeyRing) -> bytes:
    """Decrypt a payload produced by :func:`seal` (legacy fallback supported)."""
    if payload.startswith("v1."):
        parts = payload.split(".", 2)
        if len(parts) != 3:
            raise ValueError("Malformed sealed payload")
        _, key_id, b64 = parts
        code = base64.urlsafe_b64decode(b64.encode("ascii"))
        return ring.decrypt(code, key_id)
    # Legacy Fernet payload (no versioning tag): treat as active key, v1.
    return ring.decrypt(payload.encode("ascii"), ring.active_key_id)


# ── SecretProvider interface ─────────────────────────────────────────────────


class SecretProvider(abc.ABC):
    """Abstract secret store used to avoid spreading secret access."""

    @abc.abstractmethod
    def get_secret(self, name: str) -> str | None:
        """Return secret value or None if absent."""

    @abc.abstractmethod
    def set_secret(self, name: str, value: str) -> None:
        """Create or update a secret."""

    @abc.abstractmethod
    def delete_secret(self, name: str) -> None:
        """Remove a secret."""


class DatabaseSecretProvider(SecretProvider):
    """Encrypted secret storage backed by the DB (local backend).

    Each secret row is encrypted at rest with the Fernet key ring and tagged
    with its ``encryption_key_id``. Never stores plaintext values.

    The concrete async implementation resides in the API layer where the DB
    session is available; the signer-service uses a filesystem/secret-store
    provider instead (it must not require a DB connection).
    """

    def __init__(self, ring: FernetKeyRing, session_factory=None) -> None:
        self._ring = ring
        self._session_factory = session_factory

    def get_secret(self, name: str) -> str | None:  # pragma: no cover
        raise NotImplementedError("Use the async API provider in request context")

    def set_secret(self, name: str, value: str) -> None:  # pragma: no cover
        raise NotImplementedError("Use the async API provider in request context")

    def delete_secret(self, name: str) -> None:  # pragma: no cover
        raise NotImplementedError("Use the async API provider in request context")


# ── Adapters stubs (future) ──────────────────────────────────────────────────


class VaultSecretProvider(SecretProvider):
    """Future HashiCorp Vault adapter. Not implemented yet."""

    def get_secret(self, name: str) -> str | None:
        raise NotImplementedError("Vault adapter not yet implemented")

    def set_secret(self, name: str, value: str) -> None:
        raise NotImplementedError("Vault adapter not yet implemented")

    def delete_secret(self, name: str) -> None:
        raise NotImplementedError("Vault adapter not yet implemented")


class AwsSecretsManagerProvider(SecretProvider):
    """Future AWS Secrets Manager adapter. Not implemented yet."""

    def get_secret(self, name: str) -> str | None:
        raise NotImplementedError("AWS adapter not yet implemented")

    def set_secret(self, name: str, value: str) -> None:
        raise NotImplementedError("AWS adapter not yet implemented")

    def delete_secret(self, name: str) -> None:
        raise NotImplementedError("AWS adapter not yet implemented")


class AzureKeyVaultProvider(SecretProvider):
    """Future Azure Key Vault adapter. Not implemented yet."""

    def get_secret(self, name: str) -> str | None:
        raise NotImplementedError("Azure adapter not yet implemented")

    def set_secret(self, name: str, value: str) -> None:
        raise NotImplementedError("Azure adapter not yet implemented")

    def delete_secret(self, name: str) -> None:
        raise NotImplementedError("Azure adapter not yet implemented")


class GcpSecretManagerProvider(SecretProvider):
    """Future GCP Secret Manager adapter. Not implemented yet."""

    def get_secret(self, name: str) -> str | None:
        raise NotImplementedError("GCP adapter not yet implemented")

    def set_secret(self, name: str, value: str) -> None:
        raise NotImplementedError("GCP adapter not yet implemented")

    def delete_secret(self, name: str) -> None:
        raise NotImplementedError("GCP adapter not yet implemented")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)
