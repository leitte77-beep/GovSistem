"""Tests for fail-closed configuration and the versioned key ring."""

from __future__ import annotations

import pytest

from app.services.encryption import decrypt, decrypt_bytes, encrypt, encrypt_bytes
from app.services.secrets import FernetKeyRing, derivate_fern_key, seal, unseal


def test_derivate_fernet_key_is_deterministic():
    a = derivate_fern_key("master", "v1")
    b = derivate_fern_key("master", "v1")
    assert a == b
    c = derivate_fern_key("master", "v2")
    assert a != c


def test_key_ring_roundtrip_and_key_id_tag():
    ring = FernetKeyRing(
        "master-secret",
        {"v1": "master-secret", "v2": "other-segment"},
        active_key_id="v2",
    )
    sealed = seal(b"hello", ring)
    assert sealed.startswith("v1.v2.")
    assert unseal(sealed, ring) == b"hello"
    # v1 ciphertext still decryptable (rotation safety).
    old = seal(
        b"legacy",
        FernetKeyRing("master-secret", {"v1": "master-secret"}, active_key_id="v1"),
    )
    assert unseal(old, ring) == b"legacy"


def test_key_ring_rejects_unknown_key_id():
    ring = FernetKeyRing("m")
    with pytest.raises(ValueError):
        ring.fernet("v99")


def test_encryption_service_roundtrip_and_legacy_fallback():
    enc = encrypt("secret-password")
    assert enc.startswith("v1.")
    assert decrypt(enc) == "secret-password"
    b = encrypt_bytes(b"\x00\x01\x02")
    assert decrypt_bytes(b) == b"\x00\x01\x02"


def test_encryption_detects_tampering():
    enc = encrypt("value")
    # Corrupt the ciphertext body; decryption must raise.
    with pytest.raises(Exception):
        decrypt(enc[:-1])


# ── Fail-closed production config ───────────────────────────────────────────


@pytest.mark.parametrize(
    "env,field,value,expect_error",
    [
        ("production", "SECRET_KEY", "change-me-in-dev", True),
        ("production", "SECRET_KEY", "changeme", True),
        ("production", "SECRET_KEY", "a" * 64, False),
        ("production", "INTERNAL_API_KEY", "change-me-in-dev", True),
        ("production", "INTERNAL_API_KEY", "short", True),
        ("production", "INTERNAL_API_KEY", "x" * 48, False),
        ("production", "SIGNER_PROVIDER", "mock", True),
        ("production", "SIGNER_PROVIDER", "a1", False),
        ("development", "SIGNER_PROVIDER", "mock", False),
        ("development", "SECRET_KEY", "change-me-in-dev", False),
    ],
)
def test_production_config_guards(env, field, value, expect_error):
    from app.core.config import Settings

    # Build Settings explicitly via init kwargs (init kwargs take precedence
    # over env vars in pydantic-settings). Avoids reload gymnastics.
    kwargs = {
        "ENVIRONMENT": env,
        "POSTGRES_PASSWORD": "strong-password-for-test",
        "SECRET_KEY": ("a" * 64) if field != "SECRET_KEY" else value,
        "INTERNAL_API_KEY": ("c" * 48) if field != "INTERNAL_API_KEY" else value,
        "SIGNER_PROVIDER": "a1" if field != "SIGNER_PROVIDER" else value,
    }
    try:
        Settings(**kwargs)
        raised = None
    except ValueError as exc:  # pragma: no cover - intent is to inspect
        raised = exc
    if expect_error:
        assert raised is not None, f"Expected ValueError for {field}={value!r}"
    else:
        assert raised is None, f"Unexpected error: {raised}"
