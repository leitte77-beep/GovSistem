"""Contadores públicos: visitas ao portal e acessos por edição."""

from __future__ import annotations

import uuid
from datetime import date

import pytest
import pytest_asyncio

from app.api.public_v1.router import limiter
from app.core.tenant import require_tenant
from app.main import app
from app.models.edition import Edition
from app.models.enums import EditionStatus
from app.models.organization import Organization

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/130"}


@pytest_asyncio.fixture
async def org(db_session, monkeypatch):
    monkeypatch.setattr(limiter, "enabled", False)
    o = Organization(name="PREFEITURA DE FAROL", slug=f"farol-{uuid.uuid4().hex[:6]}")
    db_session.add(o)
    await db_session.commit()
    app.dependency_overrides[require_tenant] = lambda: o
    yield o
    app.dependency_overrides.pop(require_tenant, None)


async def _edition(db_session, org, status=EditionStatus.PUBLISHED):
    e = Edition(organization_id=org.id, number=67, year=2026, title="Edição nº 67",
                publication_date=date(2026, 10, 20), status=status, created_by=uuid.uuid4())
    db_session.add(e)
    await db_session.commit()
    return e


async def test_portal_visits_increment(client, org):
    assert (await client.get("/api/public/v1/stats")).json() == {"visits": 0}
    for expected in (1, 2, 3):
        r = await client.post("/api/public/v1/stats/visit", headers=UA)
        assert r.json() == {"visits": expected}
    assert (await client.get("/api/public/v1/stats")).json() == {"visits": 3}


@pytest.mark.parametrize("ua", ["", "Googlebot/2.1", "WhatsApp/2.23", "facebookexternalhit/1.1"])
async def test_bots_do_not_count(client, org, ua):
    r = await client.post("/api/public/v1/stats/visit", headers={"User-Agent": ua})
    assert r.json() == {"visits": 0}


async def test_edition_views(client, org, db_session):
    e = await _edition(db_session, org)
    assert (await client.post(f"/api/public/v1/edition-views/{e.id}", headers=UA)).json() == {"views": 1}
    assert (await client.post(f"/api/public/v1/edition-views/{e.id}", headers=UA)).json() == {"views": 2}
    assert (await client.get(f"/api/public/v1/edition-views/{e.id}")).json() == {"views": 2}


async def test_unpublished_edition_is_404(client, org, db_session):
    e = await _edition(db_session, org, status=EditionStatus.DRAFT)
    r = await client.post(f"/api/public/v1/edition-views/{e.id}", headers=UA)
    assert r.status_code == 404
