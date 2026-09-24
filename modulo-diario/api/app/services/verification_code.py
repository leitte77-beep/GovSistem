"""Cryptographically-secure verification code generation.

Replaces the predictable ``{year}{number:04d}-{hash8}`` scheme with a
high-entropy code formatted as ``XXXX-XXXX-XXXX-XXXX`` (e.g.
``7K4P-M92X-F8QD-T3WA``) drawn from a 32-char unambiguous alphabet
(no ``0/O``, ``1/I``). Codes are generated with ``os.urandom``.

The stored value is a length-preserving hash of the code so the raw code is
not kept in plaintext; validation hashes the presented code before lookup.
"""

from __future__ import annotations

import hashlib
import secrets

_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # 31 chars, no ambiguous
_BLOCKS = 4
_BLOCK_LEN = 4


def generate_secure_code() -> str:
    """Return a random ``XXXX-XXXX-XXXX-XXXX`` verification code."""
    total = _BLOCKS * _BLOCK_LEN
    rnd = secrets.token_bytes(total)
    chars = [_ALPHABET[b % len(_ALPHABET)] for b in rnd]
    return "-".join(
        "".join(chars[i * _BLOCK_LEN:(i + 1) * _BLOCK_LEN]) for i in range(_BLOCKS)
    )


def _normalize(code: str) -> str:
    return code.replace("-", "").replace(" ", "").upper()


def hash_code(code: str) -> str:
    """Return the SHA-256 hex digest of a normalized code."""
    return hashlib.sha256(_normalize(code).encode("utf-8")).hexdigest()


def code_to_hash_lookup(code: str, expected_hash: str) -> bool:
    """Constant-time comparison of a presented code against a stored hash."""
    return secrets.compare_digest(hash_code(code), expected_hash)
