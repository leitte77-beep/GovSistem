"""Tests for the 5 settings endpoints (ADMIN only)."""
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.main import app
from app.core.auth import get_current_user
from app.core.database import get_db


@pytest.fixture(autouse=True)
def override_auth_and_db():
    mock_session = AsyncMock()

    # Make refresh() populate id and timestamps for newly created objects
    async def _refresh(obj):
        if not obj.id:
            obj.id = uuid.uuid4()
        if not obj.created_at:
            obj.created_at = datetime.now(timezone.utc)
        if not obj.updated_at:
            obj.updated_at = datetime.now(timezone.utc)
    mock_session.refresh.side_effect = _refresh

    mock_user = MagicMock()
    mock_user.id = uuid.uuid4()
    mock_user.email = "admin@test.com"
    mock_user.name = "Admin"
    mock_user.is_active = True
    mock_role = MagicMock()
    mock_role.name = "ADMIN"
    mock_ur = MagicMock()
    mock_ur.role = mock_role
    mock_user.user_roles = [mock_ur]

    app.dependency_overrides[get_db] = lambda: mock_session
    app.dependency_overrides[get_current_user] = lambda: mock_user
    yield mock_session
    app.dependency_overrides.clear()


def _make_setting(**kwargs):
    s = MagicMock()
    s.id = kwargs.get("id", uuid.uuid4())
    s.key = kwargs.get("key", "test_key")
    s.value = kwargs.get("value", "test_value")
    s.description = kwargs.get("description", "A test setting")
    s.category = kwargs.get("category", "general")
    s.type = kwargs.get("type", "string")
    s.is_encrypted = kwargs.get("is_encrypted", False)
    s.is_public = kwargs.get("is_public", False)
    s.created_at = kwargs.get("created_at", datetime(2026, 1, 1))
    s.updated_at = kwargs.get("updated_at", datetime(2026, 1, 1))
    return s


# ── List Settings ─────────────────────────────────────────────────────────────


@pytest.mark.anyio
async def test_list_settings(client, override_auth_and_db):
    mock_db = override_auth_and_db
    setting = _make_setting()
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [setting]
    mock_db.execute.return_value = mock_result

    response = await client.get("/api/v1/settings")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 1
    assert data[0]["key"] == "test_key"


@pytest.mark.anyio
async def test_list_settings_by_category(client, override_auth_and_db):
    mock_db = override_auth_and_db
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = []
    mock_db.execute.return_value = mock_result

    response = await client.get("/api/v1/settings?category=general")
    assert response.status_code == 200
    assert response.json() == []


# ── Get Setting ───────────────────────────────────────────────────────────────


@pytest.mark.anyio
async def test_get_setting(client, override_auth_and_db):
    mock_db = override_auth_and_db
    setting = _make_setting()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = setting
    mock_db.execute.return_value = mock_result

    response = await client.get(f"/api/v1/settings/{setting.id}")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == str(setting.id)
    assert data["key"] == setting.key


@pytest.mark.anyio
async def test_get_setting_not_found(client, override_auth_and_db):
    mock_db = override_auth_and_db
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_db.execute.return_value = mock_result

    response = await client.get(f"/api/v1/settings/{uuid.uuid4()}")
    assert response.status_code == 404


# ── Create Setting ────────────────────────────────────────────────────────────


@pytest.mark.anyio
async def test_create_setting(client, override_auth_and_db):
    mock_db = override_auth_and_db
    # First call: check existing key (none found)
    r1 = MagicMock()
    r1.scalar_one_or_none.return_value = None
    mock_db.execute.return_value = r1

    payload = {
        "key": "new_setting",
        "value": "some_value",
        "description": "Description",
        "category": "general",
        "type": "string",
        "is_encrypted": False,
        "is_public": True,
    }
    response = await client.post("/api/v1/settings", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert "id" in data
    assert data["key"] == "new_setting"


@pytest.mark.anyio
async def test_create_setting_duplicate_key(client, override_auth_and_db):
    mock_db = override_auth_and_db
    existing = _make_setting(key="duplicate_key")
    r1 = MagicMock()
    r1.scalar_one_or_none.return_value = existing
    mock_db.execute.return_value = r1

    payload = {
        "key": "duplicate_key",
        "value": "val",
        "category": "general",
        "type": "string",
    }
    response = await client.post("/api/v1/settings", json=payload)
    assert response.status_code == 409


# ── Update Setting ────────────────────────────────────────────────────────────


@pytest.mark.anyio
async def test_update_setting(client, override_auth_and_db):
    mock_db = override_auth_and_db
    setting = _make_setting()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = setting
    mock_db.execute.return_value = mock_result

    payload = {"value": "updated_value", "description": "Updated description"}
    response = await client.patch(f"/api/v1/settings/{setting.id}", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == str(setting.id)


@pytest.mark.anyio
async def test_update_setting_not_found(client, override_auth_and_db):
    mock_db = override_auth_and_db
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_db.execute.return_value = mock_result

    payload = {"value": "updated"}
    response = await client.patch(f"/api/v1/settings/{uuid.uuid4()}", json=payload)
    assert response.status_code == 404


# ── Delete Setting ────────────────────────────────────────────────────────────


@pytest.mark.anyio
async def test_delete_setting(client, override_auth_and_db):
    mock_db = override_auth_and_db
    setting = _make_setting()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = setting
    mock_db.execute.return_value = mock_result

    response = await client.delete(f"/api/v1/settings/{setting.id}")
    assert response.status_code == 204


@pytest.mark.anyio
async def test_delete_setting_not_found(client, override_auth_and_db):
    mock_db = override_auth_and_db
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_db.execute.return_value = mock_result

    response = await client.delete(f"/api/v1/settings/{uuid.uuid4()}")
    assert response.status_code == 404
