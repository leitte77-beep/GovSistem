"""Tests for the 4 MFA endpoints."""
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.main import app
from app.core.auth import get_current_user
from app.core.database import get_db


@pytest.fixture(autouse=True)
def override_auth_and_db():
    mock_session = AsyncMock()
    mock_user = MagicMock()
    mock_user.id = uuid.uuid4()
    mock_user.organization_id = uuid.uuid4()
    mock_user.email = "user@example.com"
    mock_user.name = "Test User"
    mock_user.is_active = True
    mock_user.mfa_secret = None
    mock_user.mfa_enabled = False
    mock_role = MagicMock()
    mock_role.name = "ADMIN"
    mock_ur = MagicMock()
    mock_ur.role = mock_role
    mock_user.user_roles = [mock_ur]

    app.dependency_overrides[get_db] = lambda: mock_session
    app.dependency_overrides[get_current_user] = lambda: mock_user
    yield mock_session, mock_user
    app.dependency_overrides.clear()


# ── Setup MFA ─────────────────────────────────────────────────────────────────


@patch("app.api.v1.mfa.get_totp_uri", return_value="otpauth://totp/user@example.com?secret=BASE32SECRET")
@patch("app.api.v1.mfa.generate_totp_secret", return_value="BASE32SECRET")
@patch("app.services.encryption.encrypt", return_value="enc_secret")
@pytest.mark.anyio
async def test_setup_mfa(mock_enc, mock_gen, mock_uri, client, override_auth_and_db):
    mock_db, _ = override_auth_and_db
    response = await client.post("/api/v1/mfa/setup")
    assert response.status_code == 200
    data = response.json()
    assert data["secret"] == "BASE32SECRET"
    assert "uri" in data
    assert "message" in data


# ── Verify MFA Setup ──────────────────────────────────────────────────────────


@patch("app.api.v1.mfa.verify_totp", return_value=True)
@patch("app.services.encryption.decrypt", return_value="BASE32SECRET")
@pytest.mark.anyio
async def test_verify_mfa_setup(mock_decrypt, mock_verify, client, override_auth_and_db):
    mock_db, mock_user = override_auth_and_db
    mock_user.mfa_secret = "enc_secret"
    response = await client.post("/api/v1/mfa/verify?token=123456")
    assert response.status_code == 200
    data = response.json()
    assert data["message"] == "MFA enabled successfully"


@patch("app.api.v1.mfa.verify_totp", return_value=False)
@patch("app.services.encryption.decrypt", return_value="BASE32SECRET")
@pytest.mark.anyio
async def test_verify_mfa_invalid_token(mock_decrypt, mock_verify, client, override_auth_and_db):
    mock_db, mock_user = override_auth_and_db
    mock_user.mfa_secret = "enc_secret"
    response = await client.post("/api/v1/mfa/verify?token=000000")
    assert response.status_code == 400


@pytest.mark.anyio
async def test_verify_mfa_not_setup(client, override_auth_and_db):
    mock_db, mock_user = override_auth_and_db
    mock_user.mfa_secret = None
    response = await client.post("/api/v1/mfa/verify?token=123456")
    assert response.status_code == 400


# ── QR Code ───────────────────────────────────────────────────────────────────


@patch("app.api.v1.mfa.get_totp_uri", return_value="otpauth://totp/user@example.com")
@patch("app.services.encryption.decrypt", return_value="BASE32SECRET")
@pytest.mark.anyio
async def test_mfa_qrcode(mock_decrypt, mock_uri, client, override_auth_and_db):
    mock_db, mock_user = override_auth_and_db
    mock_user.mfa_secret = "enc_secret"
    response = await client.get("/api/v1/mfa/qrcode")
    assert response.status_code == 200
    assert response.headers.get("content-type") == "image/png"


@pytest.mark.anyio
async def test_mfa_qrcode_not_setup(client, override_auth_and_db):
    mock_db, mock_user = override_auth_and_db
    mock_user.mfa_secret = None
    response = await client.get("/api/v1/mfa/qrcode")
    assert response.status_code == 400


# ── MFA Status ────────────────────────────────────────────────────────────────


@pytest.mark.anyio
async def test_mfa_status_enabled(client, override_auth_and_db):
    mock_db, mock_user = override_auth_and_db
    mock_user.mfa_enabled = True
    mock_user.mfa_secret = "enc_secret"
    response = await client.get("/api/v1/mfa/status")
    assert response.status_code == 200
    data = response.json()
    assert data["enabled"] is True
    assert data["has_secret"] is True


@pytest.mark.anyio
async def test_mfa_status_disabled(client, override_auth_and_db):
    mock_db, mock_user = override_auth_and_db
    mock_user.mfa_enabled = False
    mock_user.mfa_secret = None
    response = await client.get("/api/v1/mfa/status")
    assert response.status_code == 200
    data = response.json()
    assert data["enabled"] is False
    assert data["has_secret"] is False
