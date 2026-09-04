"""Tests for credential secret decryption (credential_secrets helper)."""

from __future__ import annotations

import pytest
from cryptography.fernet import InvalidToken
from fastapi import HTTPException

from app.services.credential_secrets import decrypt_credential_secrets
from app.services.encryption import encrypt_bytes, encrypt


def _credential(config: dict):
    class _Cred:
        def __init__(self, cfg):
            self.config = cfg
            self.id = "99999999-9999-4999-8999-999999999999"

    return _Cred(config)


def test_decrypt_valid_pfx_and_password():
    cred = _credential(
        {
            "pfx_encrypted": encrypt_bytes(b"PFX-BYTES").decode("utf-8"),
            "password_encrypted": encrypt("segredo"),
        }
    )
    pfx, pw = decrypt_credential_secrets(cred)
    assert pfx == b"PFX-BYTES"
    assert pw == "segredo"


def test_decrypt_without_password_returns_empty():
    cred = _credential({"pfx_encrypted": encrypt_bytes(b"PFX-BYTES").decode("utf-8")})
    _, pw = decrypt_credential_secrets(cred)
    assert pw == ""


def test_missing_pfx_raises_422():
    cred = _credential({"password_encrypted": encrypt("x")})
    with pytest.raises(HTTPException) as exc:
        decrypt_credential_secrets(cred)
    assert exc.value.status_code == 422


def test_bad_ciphertext_raises_500():
    # Valid Fernet token (well-formed) but encrypted with another key => InvalidToken.
    cred = _credential(
        {"pfx_encrypted": "v1.v1.aGVsbG8=", "password_encrypted": ""}
    )
    with pytest.raises(HTTPException) as exc:
        decrypt_credential_secrets(cred)
    assert exc.value.status_code == 500


def test_bad_password_ciphertext_raises_500():
    cred = _credential(
        {
            "pfx_encrypted": encrypt_bytes(b"PFX-BYTES").decode("utf-8"),
            "password_encrypted": "v1.v1.aGVsbG8=",
        }
    )
    with pytest.raises(HTTPException) as exc:
        decrypt_credential_secrets(cred)
    assert exc.value.status_code == 500
