"""Tests for the recent strong-authentication (MFA) proof."""

from __future__ import annotations

import uuid

from app.services.recent_auth import (
    issue_recent_auth,
    validate_recent_auth,
)


def test_issue_and_validate():
    u = uuid.uuid4()
    token = issue_recent_auth(u)
    assert validate_recent_auth(token, u) is True


def test_token_requires_same_user():
    u = uuid.uuid4()
    token = issue_recent_auth(u)
    assert validate_recent_auth(token, u) is True
    assert validate_recent_auth(token, uuid.uuid4()) is False


def test_tampered_token_rejected():
    u = uuid.uuid4()
    token = issue_recent_auth(u)
    parts = token.split(".")
    parts[1] = parts[1][:-1] + ("A" if parts[1][-1] != "A" else "B")
    tampered = ".".join(parts)
    assert validate_recent_auth(tampered, u) is False


def test_empty_and_malformed_rejected():
    assert validate_recent_auth(None, uuid.uuid4()) is False
    assert validate_recent_auth("garbage", uuid.uuid4()) is False
    assert validate_recent_auth("ra1.abc.def", uuid.uuid4()) is False


def test_expired_token_rejected(monkeypatch):
    u = uuid.uuid4()
    token = issue_recent_auth(u, ttl_seconds=-1)  # already expired
    assert validate_recent_auth(token, u) is False
