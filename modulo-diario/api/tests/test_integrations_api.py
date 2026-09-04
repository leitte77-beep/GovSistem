"""Tests for the external integration API and idempotency."""

from __future__ import annotations

import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.database import get_db
from app.core.integration_auth import ALLOWED_SCOPES, FORBIDDEN_SCOPES, hash_api_key
from app.main import app


def test_scopes_exclude_publication():
    assert "matter:create" in ALLOWED_SCOPES
    assert "edition:publish" in FORBIDDEN_SCOPES
    assert "edition:publish" not in ALLOWED_SCOPES


def test_api_key_hashed_not_plaintext():
    raw = "super-secret-key"
    h = hash_api_key(raw)
    assert h != raw
    assert len(h) == 64  # sha256


def _integration_payload(at_id, title="Portaria externa"):
    return {
        "act_type_id": str(at_id),
        "title": title,
        "content_html": "<p>Conteúdo da matéria externa.</p>",
        "plain_text": "Conteúdo da matéria externa.",
        "act_number": "99",
        "act_year": 2026,
        "publication_type": "normal",
    }


@pytest.fixture
def client(db_session):
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    ac = AsyncClient(transport=transport, base_url="http://test")
    yield ac

    app.dependency_overrides.pop(get_db, None)


@pytest.mark.anyio
@pytest.mark.asyncio
async def test_integration_requires_api_key(client):
    resp = await client.post(
        "/api/v1/integrations/matters",
        json=_integration_payload(uuid.uuid4()),
    )
    assert resp.status_code == 401


@pytest.mark.anyio
@pytest.mark.asyncio
async def test_integration_rejects_unknown_key(client):
    resp = await client.post(
        "/api/v1/integrations/matters",
        json=_integration_payload(uuid.uuid4()),
        headers={"X-Integration-Key": "unknown"},
    )
    assert resp.status_code == 401


@pytest.mark.anyio
@pytest.mark.asyncio
async def test_integration_idempotent_with_valid_key(client, db_session):
    from app.models.act_type import ActType
    from app.models.integration_client import IntegrationClient
    from app.models.organization import Organization
    from app.models.user import User
    from app.core.integration_auth import hash_api_key

    org = Organization(name="Gov", slug="gov-int")
    db_session.add(org)
    await db_session.flush()
    at = ActType(name="Portaria", description="Portaria")
    db_session.add(at)
    await db_session.flush()
    user = User(name="Servidor", email="servidor@gov.test", organization_id=org.id, is_active=True)
    db_session.add(user)
    db_session.add(
        IntegrationClient(
            organization_id=org.id,
            name="GovPro",
            client_id="govpro",
            hashed_api_key=hash_api_key("test-key-123"),
            status="active",
            scopes={"list": ["matter:create", "matter:read", "matter:submit"]},
        )
    )
    await db_session.commit()

    headers = {"X-Integration-Key": "test-key-123", "Idempotency-Key": "req-abc-123"}
    payload = _integration_payload(
        at.id,
        title="Portaria integrada",
    )
    payload["plain_text"] = payload["content_html"]
    payload["author_email"] = "servidor@gov.test"
    r1 = await client.post("/api/v1/integrations/matters", json=payload, headers=headers)
    assert r1.status_code == 201, r1.text
    r2 = await client.post("/api/v1/integrations/matters", json=payload, headers=headers)
    assert r2.status_code == 201
    assert r2.json().get("duplicate") is True
    assert r2.json().get("id") == r1.json().get("id")
