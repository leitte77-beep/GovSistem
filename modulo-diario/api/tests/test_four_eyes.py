"""Tests for the configurable four-eyes segregation-of-duties policy."""

from __future__ import annotations

import uuid

import pytest
from fastapi import HTTPException
from fastapi import status as st

from app.services.four_eyes import FourEyesService


def _uid() -> uuid.UUID:
    return uuid.uuid4()


def test_disabled_policy_allows_same_actor():
    svc = FourEyesService({"four_eyes_required": False})
    u = _uid()
    svc.check(u, u, "CREATE_APPROVE")  # no raise


def test_enabled_policy_blocks_same_actor():
    svc = FourEyesService({})  # defaults FourEyesService.enabled to settings (True)
    u = _uid()
    with pytest.raises(HTTPException) as exc:
        svc.check(u, u, "CREATE_APPROVE")
    assert exc.value.status_code == st.HTTP_403_FORBIDDEN


def test_enabled_policy_allows_different_actor():
    svc = FourEyesService({})
    svc.check(_uid(), _uid(), "CREATE_APPROVE")


def test_check_pair_respects_all_rules():
    svc = FourEyesService({})
    u = _uid()
    with pytest.raises(HTTPException):
        svc.check_pair(u, u, ["CREATE_APPROVE", "APPROVE_PUBLISH"])


def test_missing_other_actor_skips_check():
    svc = FourEyesService({})
    svc.check(_uid(), None, "CREATE_APPROVE")
