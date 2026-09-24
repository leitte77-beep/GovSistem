"""Test internal API key authentication."""

from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.anyio
async def test_missing_api_key_header_rejected(client):
    """Request without X-Internal-Key must be rejected (Header -> 422)."""
    response = await client.post("/internal/sign-pdf", json={})
    assert response.status_code in (403, 422)


@pytest.mark.anyio
async def test_wrong_api_key_rejected(client):
    """Request with wrong X-Internal-Key header should be rejected."""
    response = await client.post(
        "/internal/sign-pdf",
        json={},
        headers={"X-Internal-Key": "wrong-key"},
    )
    assert response.status_code == 403


@pytest.mark.anyio
async def test_correct_api_key_accepted(client):
    """Request with correct X-Internal-Key should pass auth (may fail on validation, not auth)."""
    response = await client.post(
        "/internal/sign-pdf",
        json={},
        headers={"X-Internal-Key": "dev-internal-key-saas"},
    )
    assert response.status_code != 403


class TestVerifyInternalApiKeyMocked:
    """Direct tests of _verify_internal_api_key with mocked settings."""

    def test_rejects_wrong_key(self):
        from fastapi import HTTPException

        from app.api.internal import _verify_internal_api_key

        with patch("app.api.internal.settings") as mock_settings:
            mock_settings.INTERNAL_API_KEY.get_secret_value.return_value = "prod-secret"

            with pytest.raises(HTTPException) as exc:
                _verify_internal_api_key(x_internal_key="bad-key")
            assert exc.value.status_code == 403

    def test_accepts_correct_key(self):
        from app.api.internal import _verify_internal_api_key

        with patch("app.api.internal.settings") as mock_settings:
            mock_settings.INTERNAL_API_KEY.get_secret_value.return_value = "prod-secret"
            # Should not raise
            _verify_internal_api_key(x_internal_key="prod-secret")

    def test_fails_closed_when_key_not_configured(self):
        from fastapi import HTTPException

        from app.api.internal import _verify_internal_api_key

        with patch("app.api.internal.settings") as mock_settings:
            mock_settings.INTERNAL_API_KEY.get_secret_value.return_value = ""
            # Fail-closed: an unconfigured key must never authenticate.
            with pytest.raises(HTTPException) as exc:
                _verify_internal_api_key(x_internal_key="anything-or-empty")
            assert exc.value.status_code == 503
