"""Testes de ordenação e contagem da listagem de matérias.

Cobrem os parâmetros ``sort``/``order`` de ``GET /matters`` e o novo endpoint
``GET /matters/count`` que alimenta a paginação ("Mostrando X–Y de N").
"""

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


class _RoleName:
    def __init__(self, name: str):
        self.name = name


class _RoleObj:
    def __init__(self, name: str):
        self.role = _RoleName(name)


class _UserProxy:
    def __init__(self, user: User, roles: list[str]):
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
    org_row = Organization(name="Prefeitura Lista", slug="pf-lista", cnpj="22345678000195")
    db_session.add(org_row)
    await db_session.flush()

    admin_row = User(
        name="Admin",
        email=f"admin_{uuid.uuid4().hex[:8]}@test",
        organization_id=org_row.id,
        is_active=True,
    )
    db_session.add(admin_row)
    await db_session.flush()

    act_type_row = ActType(name="Portaria Lista", description="Portaria", config=None)
    db_session.add(act_type_row)
    await db_session.flush()

    class C:
        org = org_row
        admin = _UserProxy(admin_row, ["ADMIN"])
        act_type = act_type_row

    yield C()
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def api_client(ctx, db_session):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        def bind(user):
            app.dependency_overrides[get_db] = lambda: db_session
            app.dependency_overrides[get_current_user] = lambda: user
            return ac

        yield bind


async def _seed(api_client, ctx, titles: list[str]) -> None:
    client = api_client(ctx.admin)
    for title in titles:
        resp = await client.post(
            "/api/v1/matters",
            json={
                "title": title,
                "summary": "s",
                "act_type_id": str(ctx.act_type.id),
                "content_html": "<p>Corpo</p>",
                "content_mode": "rich_text",
            },
        )
        assert resp.status_code == 201, resp.text


async def test_list_sorts_by_title_ascending(api_client, ctx):
    await _seed(api_client, ctx, ["Gamma", "Alpha", "Beta"])
    client = api_client(ctx.admin)

    resp = await client.get("/api/v1/matters", params={"sort": "title", "order": "asc"})
    assert resp.status_code == 200, resp.text
    assert [m["title"] for m in resp.json()] == ["Alpha", "Beta", "Gamma"]


async def test_list_sorts_by_title_descending(api_client, ctx):
    await _seed(api_client, ctx, ["Gamma", "Alpha", "Beta"])
    client = api_client(ctx.admin)

    resp = await client.get("/api/v1/matters", params={"sort": "title", "order": "desc"})
    assert resp.status_code == 200, resp.text
    assert [m["title"] for m in resp.json()] == ["Gamma", "Beta", "Alpha"]


async def test_list_unknown_sort_falls_back_without_error(api_client, ctx):
    await _seed(api_client, ctx, ["Alpha"])
    client = api_client(ctx.admin)

    resp = await client.get(
        "/api/v1/matters",
        params={"sort": "título; drop table", "order": "asc"},
    )
    assert resp.status_code == 200, resp.text
    assert len(resp.json()) == 1


async def test_count_matches_filters(api_client, ctx):
    await _seed(api_client, ctx, ["Alpha", "Beta", "Gamma"])
    client = api_client(ctx.admin)

    all_count = await client.get("/api/v1/matters/count")
    assert all_count.status_code == 200, all_count.text
    assert all_count.json() == {"total": 3}

    searched = await client.get("/api/v1/matters/count", params={"search": "Alpha"})
    assert searched.json() == {"total": 1}

    drafted = await client.get("/api/v1/matters/count", params={"status": "draft"})
    assert drafted.json() == {"total": 3}

    published = await client.get("/api/v1/matters/count", params={"status": "published"})
    assert published.json() == {"total": 0}
