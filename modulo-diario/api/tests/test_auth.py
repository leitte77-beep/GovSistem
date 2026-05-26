"""Tests for authentication: password hashing, JWT, token lifecycle."""

import uuid
from datetime import datetime, timezone

import pytest

from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)


class TestPasswordHashing:
    def test_hash_and_verify(self):
        h = hash_password("my_secret_pass")
        assert verify_password("my_secret_pass", h)

    def test_wrong_password_fails(self):
        h = hash_password("correct")
        assert not verify_password("wrong", h)

    def test_same_password_different_hash(self):
        h1 = hash_password("same")
        h2 = hash_password("same")
        assert h1 != h2


class TestAccessToken:
    def test_create_and_decode(self):
        uid = uuid.uuid4()
        token = create_access_token(uid, ["ADMIN", "AUTOR"])
        payload = decode_token(token)
        assert payload["sub"] == str(uid)
        assert payload["roles"] == ["ADMIN", "AUTOR"]
        assert payload["type"] == "access"
        assert "exp" in payload
        assert "iat" in payload

    def test_access_token_has_correct_type(self):
        token = create_access_token(uuid.uuid4(), ["AUTOR"])
        payload = decode_token(token)
        assert payload["type"] == "access"

    def test_invalid_token_raises(self):
        with pytest.raises(Exception):
            decode_token("this.is.not.a.valid.token")


class TestRefreshToken:
    def test_create_and_decode(self):
        uid = uuid.uuid4()
        jti = uuid.uuid4()
        token = create_refresh_token(uid, jti)
        payload = decode_token(token)
        assert payload["sub"] == str(uid)
        assert payload["jti"] == str(jti)
        assert payload["type"] == "refresh"

    def test_refresh_has_different_type(self):
        uid = uuid.uuid4()
        access = create_access_token(uid, [])
        refresh = create_refresh_token(uid, uuid.uuid4())
        access_p = decode_token(access)
        refresh_p = decode_token(refresh)
        assert access_p["type"] == "access"
        assert refresh_p["type"] == "refresh"
        assert access_p["type"] != refresh_p["type"]


class TestTokenExpiry:
    def test_access_token_expires(self):
        from app.core.config import settings
        now = datetime.now(timezone.utc)
        uid = uuid.uuid4()
        token = create_access_token(uid, [])
        payload = decode_token(token)
        exp = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
        expected = settings.ACCESS_TOKEN_EXPIRE_MINUTES
        diff = (exp - now).total_seconds()
        assert abs(diff / 60 - expected) < 1  # within 1 minute tolerance
