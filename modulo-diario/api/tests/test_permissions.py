"""Tests for the granular permission service."""

from __future__ import annotations

import pytest

from app.core.permissions import (
    ALL_PERMISSIONS,
    PermissionService,
    permissions_for_roles,
)


class _Role:
    def __init__(self, name: str):
        self.name = name


class _UserRole:
    def __init__(self, name: str):
        self.role = _Role(name)


class _User:
    def __init__(self, *roles: str):
        self.user_roles = [_UserRole(r) for r in roles]


def test_super_admin_and_admin_have_all():
    assert permissions_for_roles({"SUPER_ADMIN"}) == ALL_PERMISSIONS
    assert permissions_for_roles({"ADMIN"}) == ALL_PERMISSIONS


def test_roles_aggregate_disjoint_permissions():
    assert "matter.create" in permissions_for_roles({"AUTOR"})
    assert "matter.approve" in permissions_for_roles({"REVISOR"})
    assert "matter.approve" not in permissions_for_roles({"AUTOR"})


def test_service_has_and_require():
    svc = PermissionService(_User("ADMIN"))
    assert svc.has("edition.publish")
    svc.require("audit.read")  # no raise

    author = PermissionService(_User("AUTOR"))
    assert author.has("matter.create")
    assert not author.has("edition.publish")


def test_service_require_raises_forbidden():
    from fastapi import HTTPException
    from fastapi import status as st

    author = PermissionService(_User("AUTOR"))
    with pytest.raises(HTTPException) as exc:
        author.require("edition.sign")
    assert exc.value.status_code == st.HTTP_403_FORBIDDEN
