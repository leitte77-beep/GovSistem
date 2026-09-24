"""Tests for the 5 user endpoints (all require ADMIN)."""
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

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
    mock_session.refresh.side_effect = _refresh

    mock_user = MagicMock()
    mock_user.id = uuid.uuid4()
    mock_user.organization_id = uuid.uuid4()
    mock_user.email = "admin@example.com"
    mock_user.name = "Admin User"
    mock_user.is_active = True
    mock_role = MagicMock()
    mock_role.name = "ADMIN"
    mock_ur = MagicMock()
    mock_ur.role = mock_role
    mock_user.user_roles = [mock_ur]

    app.dependency_overrides[get_db] = lambda: mock_session
    app.dependency_overrides[get_current_user] = lambda: mock_user
    yield mock_session, mock_user
    app.dependency_overrides.clear()


def _make_user():
    u = MagicMock()
    u.id = uuid.uuid4()
    u.email = "user@example.com"
    u.name = "Test User"
    u.cpf = None
    u.is_active = True
    u.organization_id = uuid.uuid4()
    u.created_at = datetime(2026, 1, 1)
    u.deleted_at = None
    return u


# ── List Users ────────────────────────────────────────────────────────────────


@pytest.mark.anyio
async def test_list_users(client, override_auth_and_db):
    mock_db, _ = override_auth_and_db
    user = _make_user()
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [user]
    mock_db.execute.return_value = mock_result

    response = await client.get("/api/v1/users")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    assert data[0]["email"] == "user@example.com"


@pytest.mark.anyio
async def test_list_users_empty(client, override_auth_and_db):
    mock_db, _ = override_auth_and_db
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = []
    mock_db.execute.return_value = mock_result

    response = await client.get("/api/v1/users")
    assert response.status_code == 200
    data = response.json()
    assert data == []


# ── Get User ──────────────────────────────────────────────────────────────────


@pytest.mark.anyio
async def test_get_user(client, override_auth_and_db):
    mock_db, _ = override_auth_and_db
    user = _make_user()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = user
    mock_db.execute.return_value = mock_result

    response = await client.get(f"/api/v1/users/{user.id}")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == str(user.id)
    assert data["email"] == user.email


@pytest.mark.anyio
async def test_get_user_not_found(client, override_auth_and_db):
    mock_db, _ = override_auth_and_db
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_db.execute.return_value = mock_result

    response = await client.get(f"/api/v1/users/{uuid.uuid4()}")
    assert response.status_code == 404


# ── Create User ───────────────────────────────────────────────────────────────


@patch("app.api.v1.users.hash_password", return_value="hashed_xxx")
@patch("app.api.v1.users.select")
@pytest.mark.anyio
async def test_create_user(mock_select, mock_hash, client, override_auth_and_db):
    mock_db, _ = override_auth_and_db
    # 2 calls: check existing email, get roles
    r1 = MagicMock()
    r1.scalar_one_or_none.return_value = None  # no existing user
    r2 = MagicMock()
    role = MagicMock()
    role.id = uuid.uuid4()
    r2.scalar_one_or_none.return_value = role
    mock_db.execute.side_effect = [r1, r2]

    payload = {
        "name": "New User",
        "email": "new@example.com",
        "password": "SenhaForte123",
        "organization_id": str(uuid.uuid4()),
        "role_names": ["ADMIN"],
    }
    response = await client.post("/api/v1/users", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert "id" in data
    assert data["email"] == "new@example.com"


@patch("app.api.v1.users.hash_password", return_value="hashed_xxx")
@patch("app.api.v1.users.select")
@pytest.mark.anyio
async def test_create_user_duplicate_email(mock_select, mock_hash, client, override_auth_and_db):
    mock_db, _ = override_auth_and_db
    existing = _make_user()
    r1 = MagicMock()
    r1.scalar_one_or_none.return_value = existing
    mock_db.execute.return_value = r1

    payload = {
        "name": "New User",
        "email": "existing@example.com",
        "password": "SenhaForte123",
        "organization_id": str(uuid.uuid4()),
        "role_names": [],
    }
    response = await client.post("/api/v1/users", json=payload)
    assert response.status_code == 409


# ── Update User ───────────────────────────────────────────────────────────────


@patch("app.api.v1.users.select")
@pytest.mark.anyio
async def test_update_user(mock_select, client, override_auth_and_db):
    mock_db, _ = override_auth_and_db
    user = _make_user()
    # 2 calls: get user, existing roles
    r1 = MagicMock()
    r1.scalar_one_or_none.return_value = user
    r2 = MagicMock()
    r2.scalars.return_value.all.return_value = []
    mock_db.execute.side_effect = [r1, r2]

    payload = {"name": "Updated Name", "is_active": True}
    response = await client.put(f"/api/v1/users/{user.id}", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == str(user.id)


@patch("app.api.v1.users.hash_password", return_value="new_hashed")
@pytest.mark.anyio
async def test_update_user_password(mock_hash, client, override_auth_and_db):
    mock_db, _ = override_auth_and_db
    user = _make_user()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = user
    mock_db.execute.return_value = mock_result

    payload = {"name": "Updated Name", "password": "NovaSenha123"}
    response = await client.put(f"/api/v1/users/{user.id}", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == str(user.id)
    assert user.password_hash == "new_hashed"
    assert user.name == "Updated Name"


@pytest.mark.anyio
async def test_update_user_not_found(client, override_auth_and_db):
    mock_db, _ = override_auth_and_db
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_db.execute.return_value = mock_result

    payload = {"name": "Updated Name"}
    response = await client.put(f"/api/v1/users/{uuid.uuid4()}", json=payload)
    assert response.status_code == 404


# ── Delete User ───────────────────────────────────────────────────────────────


@pytest.mark.anyio
async def test_delete_user(client, override_auth_and_db):
    mock_db, mock_user = override_auth_and_db
    target_user = _make_user()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = target_user
    mock_db.execute.return_value = mock_result

    response = await client.delete(f"/api/v1/users/{target_user.id}")
    assert response.status_code == 204


@pytest.mark.anyio
async def test_delete_self(client, override_auth_and_db):
    mock_db, mock_user = override_auth_and_db
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_user
    mock_db.execute.return_value = mock_result

    response = await client.delete(f"/api/v1/users/{mock_user.id}")
    assert response.status_code == 400


@pytest.mark.anyio
async def test_delete_user_not_found(client, override_auth_and_db):
    mock_db, _ = override_auth_and_db
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_db.execute.return_value = mock_result

    response = await client.delete(f"/api/v1/users/{uuid.uuid4()}")
    assert response.status_code == 404
