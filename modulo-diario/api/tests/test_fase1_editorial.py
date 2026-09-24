"""Testes da Fase 1 do plano editorial.

Cobrem: análise de colagem (POST /matters/analyze), validação de duplicidade de
número do ato e os novos estados do fluxo de criação.
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

PASTE = """DECRETO Nº 214/2026

Dispõe sobre a abertura de crédito adicional.

O PREFEITO MUNICIPAL DE FAROL, no uso de suas atribuições,

DECRETA:

Art. 1º Fica aberto crédito adicional no valor de R$ 1.000,00.
Art. 2º Este Decreto entra em vigor na data de sua publicação.

Farol, 22 de setembro de 2026.

Oclécio de Freitas Meneses
Prefeito Municipal
"""


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
    org_row = Organization(name="Prefeitura Fase Um", slug="pf-f1", cnpj="12345678000196")
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

    act_type_row = ActType(name="Decreto F1", description="Decreto", config=None)
    db_session.add(act_type_row)
    await db_session.flush()

    class C:
        org = org_row
        admin = _UserProxy(admin_row, ["ADMIN", "REVISOR", "AUTOR"])
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


async def _create_matter(client, ctx, *, act_number="214", act_year=2026):
    return await client.post(
        "/api/v1/matters",
        json={
            "title": "DECRETO Nº 214/2026",
            "summary": "Dispõe sobre crédito adicional.",
            "act_type_id": str(ctx.act_type.id),
            "content_html": "<p>Art. 1º ...</p>",
            "act_number": act_number,
            "act_year": act_year,
        },
    )


# ── POST /matters/analyze ────────────────────────────────────────────────────


async def test_analyze_paste_structs_blocks_and_suggests(api_client, ctx):
    client = api_client(ctx.admin)
    resp = await client.post("/api/v1/matters/analyze", json={"plain": PASTE})
    assert resp.status_code == 200, resp.text
    data = resp.json()

    block_types = [b["type"] for b in data["document"]["blocks"]]
    assert "article" in block_types
    assert "signature_block" in block_types or "signature" in block_types

    suggestions = data["suggestions"]
    assert suggestions["act_type_name"] == "Decreto"
    assert suggestions["act_number"] == "214"
    assert suggestions["act_year"] == 2026
    assert suggestions["confidence"] >= 1.0


async def test_analyze_empty_body_is_422(api_client, ctx):
    client = api_client(ctx.admin)
    resp = await client.post("/api/v1/matters/analyze", json={"plain": "   "})
    assert resp.status_code == 422


# ── Duplicate act number ─────────────────────────────────────────────────────


async def test_duplicate_act_number_is_blocked(api_client, ctx):
    client = api_client(ctx.admin)
    first = await _create_matter(client, ctx)
    assert first.status_code == 201, first.text

    second = await _create_matter(client, ctx)
    assert second.status_code == 409, second.text
    detail = second.json()["detail"]
    assert detail["field"] == "act_number"
    assert detail["existing_matter_id"] == first.json()["id"]


async def test_duplicate_allowed_when_archived(api_client, ctx):
    client = api_client(ctx.admin)
    first = await _create_matter(client, ctx)
    assert first.status_code == 201, first.text
    matter_id = first.json()["id"]

    arch = await client.post(f"/api/v1/matters/{matter_id}/archive")
    assert arch.status_code == 200, arch.text

    second = await _create_matter(client, ctx)
    assert second.status_code == 201, second.text


# ── New workflow states ──────────────────────────────────────────────────────


async def test_new_workflow_path(api_client, ctx):
    client = api_client(ctx.admin)
    created = await _create_matter(client, ctx)
    matter_id = created.json()["id"]

    for target in ["em_elaboracao", "em_revisao", "aguardando_aprovacao", "aprovado"]:
        resp = await client.post(
            f"/api/v1/matters/{matter_id}/workflow-status",
            json={"status": target},
        )
        assert resp.status_code == 200, (target, resp.text)
        assert resp.json()["workflow_status"] == target


async def test_unknown_new_transition_is_rejected(api_client, ctx):
    client = api_client(ctx.admin)
    created = await _create_matter(client, ctx)
    matter_id = created.json()["id"]
    resp = await client.post(
        f"/api/v1/matters/{matter_id}/workflow-status",
        json={"status": "retificada"},
    )
    assert resp.status_code == 409


async def test_submit_review_sets_workflow_status(api_client, ctx):
    client = api_client(ctx.admin)
    created = await _create_matter(client, ctx)
    matter_id = created.json()["id"]

    resp = await client.post(f"/api/v1/matters/{matter_id}/submit-review")
    assert resp.status_code == 200, resp.text
    assert resp.json()["workflow_status"] == "aguardando_revisao"
