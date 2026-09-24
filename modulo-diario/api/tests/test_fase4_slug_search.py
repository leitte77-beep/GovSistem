"""Testes de slug persistente e busca (Fase 4 / P0)."""

from __future__ import annotations

import uuid

import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.core.auth import get_current_user
from app.core.database import get_db
from app.main import app
from app.models.act_type import ActType
from app.models.organization import Organization
from app.models.user import User
from app.services.matter_slug import generate_unique_slug, matter_slug, parse_slug


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
    org = Organization(name="Prefeitura Slug", slug="pf-slug", cnpj="12345678000199")
    db_session.add(org)
    await db_session.flush()

    admin = User(
        name="Admin", email=f"admin_{uuid.uuid4().hex[:8]}@test",
        organization_id=org.id, is_active=True,
    )
    db_session.add(admin)
    await db_session.flush()

    act_type = ActType(name="Portaria", config=None)
    db_session.add(act_type)
    await db_session.flush()

    class C:
        pass

    C.org = org
    C.admin = _UserProxy(admin, ["ADMIN", "AUTOR"])
    C.act_type = act_type
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


class _M:
    def __init__(self, title, number=None, year=None):
        self.title = title
        self.act_number = number
        self.act_year = year
        self.document_type = None
        self.slug = None
        self.id = uuid.uuid4()


def test_slug_prefers_stored_value():
    m = _M("QUALQUER COISA")
    m.slug = "portaria-99-2026"
    assert matter_slug(m, None) == "portaria-99-2026"


def test_parse_slug_roundtrip():
    assert parse_slug("decreto-214-2026") == ("decreto", "214", 2026)
    assert parse_slug("sem-ano-42") == ("sem-ano", "42", None)


async def test_generate_unique_slug_adds_suffix_on_collision(db_session, ctx):
    first = _M("Ato de teste")
    slug1 = await generate_unique_slug(db_session, ctx.org.id, first, None)
    assert slug1 == "ato-de-teste"

    # Duplicate title must not collide (the DB unique constraint is per org).
    from app.models.matter import Matter

    db_session.add(Matter(
        organization_id=ctx.org.id, act_type_id=ctx.act_type.id,
        title="Ato de teste", content_html="<p>x</p>", plain_text="x",
        status="draft", author_id=ctx.admin.id, slug=slug1, content_mode="rich_text",
    ))
    await db_session.flush()

    second = _M("Ato de teste")
    slug2 = await generate_unique_slug(db_session, ctx.org.id, second, None)
    assert slug2 == "ato-de-teste-2"


async def test_create_matter_assigns_slug(api_client, ctx):
    client = api_client(ctx.admin)
    resp = await client.post("/api/v1/matters", json={
        "title": "Ato de teste",
        "act_type_id": str(ctx.act_type.id),
        "content_html": "<p>x</p>",
    })
    assert resp.status_code == 201, resp.text
    assert resp.json()["slug"] == "ato-de-teste"


def test_render_snapshot_matters_exposes_slug():
    """A matéria publicada carrega o slug canônico para a URL pública."""
    from app.api.public_v1.semantic import _render_snapshot_matters

    mid = "11111111-1111-1111-1111-111111111111"
    snapshot = {
        "items": [
            {
                "id": mid,
                "position": 0,
                "title": "LEI Nº 1/2026",
                "content_html": "<p>x</p>",
            }
        ]
    }
    out = _render_snapshot_matters(snapshot, slug_by_matter={mid: "lei-1-2026"})
    assert out[0]["slug"] == "lei-1-2026"
    # Sem mapa, o slug fica ausente em vez de derrubar a renderização.
    assert _render_snapshot_matters(snapshot)[0]["slug"] is None
