"""Testes da Fase 4 — integridade, gate e retificação transacional."""

from __future__ import annotations

import uuid

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.core.auth import get_current_user
from app.core.database import get_db
from app.main import app
from app.models.act_type import ActType
from app.models.enums import MatterStatus
from app.models.matter import Matter
from app.models.matter_relation import MatterRelation
from app.models.organization import Organization
from app.models.user import User


class _RoleName:
    def __init__(self, name):
        self.name = name


class _RoleObj:
    def __init__(self, name):
        self.role = _RoleName(name)


class _UserProxy:
    def __init__(self, user, roles):
        self._user = user
        self._roles = [_RoleObj(r) for r in roles]

    @property
    def id(self):
        return self._user.id

    @property
    def organization_id(self):
        return self._user.organization_id

    @property
    def email(self):
        return self._user.email

    @property
    def name(self):
        return self._user.name

    @property
    def user_roles(self):
        return self._roles


@pytest_asyncio.fixture
async def ctx(db_session):
    org = Organization(name="Prefeitura F4", slug="pf-f4", cnpj="12345678000198")
    db_session.add(org)
    await db_session.flush()

    admin = User(
        name="Admin", email=f"admin_{uuid.uuid4().hex[:8]}@test",
        organization_id=org.id, is_active=True,
    )
    db_session.add(admin)
    await db_session.flush()

    act_type = ActType(name="Decreto", config=None)
    db_session.add(act_type)
    await db_session.flush()

    class C:
        pass

    C.org = org
    C.admin = _UserProxy(admin, ["ADMIN", "REVISOR", "AUTOR"])
    C.act_type = act_type
    C.raw_admin = admin
    yield C
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def api_client(ctx, db_session):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        def bind(user):
            app.dependency_overrides[get_db] = lambda: db_session
            app.dependency_overrides[get_current_user] = lambda: user
            return ac

        yield bind


async def _matter(db_session, ctx, *, status, number="214", title="DECRETO Nº 214/2026"):
    m = Matter(
        organization_id=ctx.org.id,
        act_type_id=ctx.act_type.id,
        title=title,
        content_html="<p>Corpo do ato</p>",
        plain_text="Corpo do ato",
        status=status,
        workflow_status="publicado" if status == MatterStatus.PUBLISHED else "rascunho",
        author_id=ctx.raw_admin.id,
        act_number=number,
        act_year=2026,
        content_mode="rich_text",
    )
    db_session.add(m)
    await db_session.flush()
    return m


async def test_rectify_creates_matter_and_relation_atomically(api_client, ctx, db_session):
    original = await _matter(db_session, ctx, status=MatterStatus.PUBLISHED)
    client = api_client(ctx.admin)

    resp = await client.post(f"/api/v1/matters/{original.id}/rectify", json={})
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["publication_type"] == "rectification"
    assert data["references_matter_id"] == str(original.id)
    assert data["status"] == "draft"

    rel = (await db_session.execute(
        select(MatterRelation).where(
            MatterRelation.source_matter_id == uuid.UUID(data["id"]),
            MatterRelation.target_matter_id == original.id,
        )
    )).scalar_one_or_none()
    assert rel is not None
    assert rel.relation_type == "rectifies"


async def test_rectify_requires_published(api_client, ctx, db_session):
    draft = await _matter(db_session, ctx, status=MatterStatus.DRAFT)
    client = api_client(ctx.admin)
    resp = await client.post(f"/api/v1/matters/{draft.id}/rectify", json={})
    assert resp.status_code == 422


async def test_duplicate_number_allowed_for_rectification_with_reference(
    api_client, ctx, db_session
):
    original = await _matter(db_session, ctx, status=MatterStatus.PUBLISHED)
    client = api_client(ctx.admin)

    # A NORMAL act with the same number is blocked.
    blocked = await client.post("/api/v1/matters", json={
        "title": "DECRETO Nº 214/2026",
        "act_type_id": str(ctx.act_type.id),
        "content_html": "<p>x</p>",
        "act_number": "214",
        "act_year": 2026,
    })
    assert blocked.status_code == 409, blocked.text

    # A RECTIFICATION referencing the original is allowed.
    allowed = await client.post("/api/v1/matters", json={
        "title": "RETIFICAÇÃO — DECRETO Nº 214/2026",
        "act_type_id": str(ctx.act_type.id),
        "content_html": "<p>x</p>",
        "act_number": "214",
        "act_year": 2026,
        "publication_type": "rectification",
        "references_matter_id": str(original.id),
    })
    assert allowed.status_code == 201, allowed.text
