"""Test internal API endpoints."""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


INTERNAL_KEY = "dev-internal-key-saas"


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
def auth_headers():
    return {"X-Internal-Api-Key": INTERNAL_KEY}


@pytest.mark.anyio
async def test_health_endpoint_returns_200(client):
    response = await client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "signer"


@pytest.mark.anyio
async def test_inspect_certificate_invalid_base64(client, auth_headers):
    """Inspect certificate with invalid base64 should return 400."""
    response = await client.post(
        "/internal/certificates/inspect",
        data={"pfx_base64": "!!!not-valid-base64!!!", "password": "test123"},
        headers=auth_headers,
    )
    assert response.status_code == 400
    assert "Invalid base64" in response.json()["detail"]


@pytest.mark.anyio
async def test_sign_pdf_auth_required_no_header(client):
    """Sign PDF endpoint should require authentication (missing header → 422)."""
    response = await client.post(
        "/internal/sign-pdf",
        json={
            "edition_id": "test-1",
            "unsigned_pdf_base64": "dGVzdA==",
            "pfx_base64": "dGVzdA==",
            "pfx_password": "pass",
        },
    )
    assert response.status_code == 422


@pytest.mark.anyio
async def test_sign_pdf_auth_required_wrong_key(client):
    """Sign PDF endpoint should reject wrong API key."""
    response = await client.post(
        "/internal/sign-pdf",
        json={},
        headers={"X-Internal-Api-Key": "wrong-key-123"},
    )
    assert response.status_code == 403


@pytest.mark.anyio
async def test_sign_pdf_with_auth_but_empty_body(client, auth_headers):
    """Sign PDF with valid auth but empty body should return 422 (validation)."""
    response = await client.post(
        "/internal/sign-pdf",
        json={},
        headers=auth_headers,
    )
    assert response.status_code == 422


@pytest.mark.anyio
async def test_sign_pdf_valid_auth_passes_gate(client, auth_headers):
    """Sign PDF with valid auth should pass auth gate (400 expected for invalid base64 payload)."""
    response = await client.post(
        "/internal/sign-pdf",
        json={
            "edition_id": "test-1",
            "unsigned_pdf_base64": "not-base64!!!",
            "pfx_base64": "not-base64!!!",
            "pfx_password": "pass",
            "reason": "Test",
            "visible": False,
        },
        headers=auth_headers,
    )
    assert response.status_code == 400
    assert "Invalid base64" in response.json()["detail"]


@pytest.mark.anyio
async def test_verify_pdf_auth_required(client):
    """Verify PDF endpoint should require authentication (missing header → 422)."""
    response = await client.post(
        "/internal/verify-pdf",
        json={"signed_pdf_base64": "dGVzdA=="},
    )
    assert response.status_code == 422
