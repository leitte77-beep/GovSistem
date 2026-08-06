"""Tests for the 3 simple GET endpoints: roles, org-units, act-types."""
import uuid
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.main import app
from app.core.auth import get_current_user
from app.core.database import get_db


@pytest.fixture(autouse=True)
def override_auth_and_db():
    mock_session = AsyncMock()
    mock_user = MagicMock()
    mock_user.id = uuid.uuid4()
    mock_user.email = "user@test.com"
    mock_user.name = "Test User"
    mock_user.is_active = True
    mock_user.organization_id = uuid.uuid4()
    mock_role = MagicMock()
    mock_role.name = "AUTOR"
    mock_ur = MagicMock()
    mock_ur.role = mock_role
    mock_user.user_roles = [mock_ur]

    app.dependency_overrides[get_db] = lambda: mock_session
    app.dependency_overrides[get_current_user] = lambda: mock_user
    yield mock_session
    app.dependency_overrides.clear()


def _make_role(**kwargs):
    r = MagicMock()
    r.id = kwargs.get("id", uuid.uuid4())
    r.name = kwargs.get("name", "ADMIN")
    r.label = kwargs.get("label", "Administrator")
    r.description = kwargs.get("description", "System admin")
    return r


def _make_org_unit(**kwargs):
    ou = MagicMock()
    ou.id = kwargs.get("id", uuid.uuid4())
    ou.name = kwargs.get("name", "Secretaria de Fazenda")
    ou.abbreviation = kwargs.get("abbreviation", "SEFAZ")
    return ou


def _make_act_type(**kwargs):
    at = MagicMock()
    at.id = kwargs.get("id", uuid.uuid4())
    at.name = kwargs.get("name", "Decreto")
    at.description = kwargs.get("description", "Decree type")
    return at


# ── Roles ─────────────────────────────────────────────────────────────────────


@pytest.mark.anyio
async def test_list_roles(client, override_auth_and_db):
    mock_db = override_auth_and_db
    role = _make_role()
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [role]
    mock_db.execute.return_value = mock_result

    response = await client.get("/api/v1/roles")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 1
    assert data[0]["name"] == "ADMIN"


@pytest.mark.anyio
async def test_list_roles_empty(client, override_auth_and_db):
    mock_db = override_auth_and_db
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = []
    mock_db.execute.return_value = mock_result

    response = await client.get("/api/v1/roles")
    assert response.status_code == 200
    assert response.json() == []


# ── Org Units ─────────────────────────────────────────────────────────────────


@pytest.mark.anyio
async def test_list_org_units(client, override_auth_and_db):
    mock_db = override_auth_and_db
    ou = _make_org_unit()
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [ou]
    mock_db.execute.return_value = mock_result

    response = await client.get("/api/v1/org-units")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 1
    assert data[0]["name"] == "Secretaria de Fazenda"


@pytest.mark.anyio
async def test_list_org_units_empty(client, override_auth_and_db):
    mock_db = override_auth_and_db
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = []
    mock_db.execute.return_value = mock_result

    response = await client.get("/api/v1/org-units")
    assert response.status_code == 200
    assert response.json() == []


# ── Act Types ─────────────────────────────────────────────────────────────────


@pytest.mark.anyio
async def test_list_act_types(client, override_auth_and_db):
    mock_db = override_auth_and_db
    at = _make_act_type()
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [at]
    mock_db.execute.return_value = mock_result

    response = await client.get("/api/v1/act-types")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 1
    assert data[0]["name"] == "Decreto"


@pytest.mark.anyio
async def test_list_act_types_empty(client, override_auth_and_db):
    mock_db = override_auth_and_db
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = []
    mock_db.execute.return_value = mock_result

    response = await client.get("/api/v1/act-types")
    assert response.status_code == 200
    assert response.json() == []
