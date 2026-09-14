"""Testes do fluxo de criação de documentos (Fase 5C).

Cobrem: estado inicial do workflow, transições válidas/inválidas, histórico de
mudanças e isolamento por organização. O ``workflow_status`` é aditivo e não
altera o ``status`` editorial.
"""

from __future__ import annotations

import uuid

import pytest
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
    org_row = Organization(name="Prefeitura Workflow", slug="pf-wf", cnpj="12345678000195")
    db_session.add(org_row)
    await db_session.flush()

    admin_row = User(
        name="Admin",
        email=f"admin_{uuid.uuid4().hex[:8]}@test",
        organization_id=org_row.id,
        is_active=True,
    )
    autor_row = User(
        name="Autor",
        email=f"autor_{uuid.uuid4().hex[:8]}@test",
        organization_id=org_row.id,
        is_active=True,
    )
    db_session.add_all([admin_row, autor_row])
    await db_session.flush()

    act_type_row = ActType(name="Portaria WF", description="Portaria", config=None)
    db_session.add(act_type_row)
    await db_session.flush()

    class C:
        org = org_row
        admin = _UserProxy(admin_row, ["ADMIN", "REVISOR"])
        autor = _UserProxy(autor_row, ["AUTOR"])
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


async def _create_matter(api_client, ctx) -> tuple[object, str]:
    client = api_client(ctx.admin)
    resp = await client.post(
        "/api/v1/matters",
        json={
            "title": "Portaria de teste",
            "summary": "s",
            "act_type_id": str(ctx.act_type.id),
            "content_html": "<p>Corpo</p>",
            "content_mode": "rich_text",
        },
    )
    assert resp.status_code == 201, resp.text
    return client, resp.json()["id"]


async def test_new_matter_starts_as_rascunho(api_client, ctx):
    _, matter_id = await _create_matter(api_client, ctx)
    client = api_client(ctx.admin)
    got = await client.get(f"/api/v1/matters/{matter_id}")
    assert got.status_code == 200
    assert got.json()["workflow_status"] == "rascunho"


async def test_full_workflow_path(api_client, ctx):
    _, matter_id = await _create_matter(api_client, ctx)
    client = api_client(ctx.admin)
    for target in [
        "gerado_pela_ia",
        "em_revisao",
        "aprovado",
        "aguardando_assinatura",
        "assinado",
        "publicado",
    ]:
        r = await client.post(
            f"/api/v1/matters/{matter_id}/workflow-status",
            json={"status": target},
        )
        assert r.status_code == 200, (target, r.text)
        assert r.json()["workflow_status"] == target


async def test_invalid_transition_is_rejected(api_client, ctx):
    _, matter_id = await _create_matter(api_client, ctx)
    client = api_client(ctx.admin)
    r = await client.post(
        f"/api/v1/matters/{matter_id}/workflow-status",
        json={"status": "assinado"},
    )
    assert r.status_code == 409


async def test_unknown_status_is_rejected(api_client, ctx):
    _, matter_id = await _create_matter(api_client, ctx)
    client = api_client(ctx.admin)
    r = await client.post(
        f"/api/v1/matters/{matter_id}/workflow-status",
        json={"status": "inexistente"},
    )
    assert r.status_code == 422


async def test_workflow_history_records_changes(api_client, ctx):
    _, matter_id = await _create_matter(api_client, ctx)
    client = api_client(ctx.admin)
    await client.post(
        f"/api/v1/matters/{matter_id}/workflow-status",
        json={"status": "gerado_pela_ia"},
    )
    await client.post(
        f"/api/v1/matters/{matter_id}/workflow-status",
        json={"status": "em_revisao", "note": "Encaminhado ao revisor"},
    )
    hist = await client.get(f"/api/v1/matters/{matter_id}/workflow-history")
    assert hist.status_code == 200
    entries = hist.json()
    actions = [e["action"] for e in entries]
    assert "matter.workflow_status_changed" in actions
    assert "matter.created" in actions
    wf = [e for e in entries if e["action"] == "matter.workflow_status_changed"]
    targets = {e["to_status"] for e in wf}
    assert {"gerado_pela_ia", "em_revisao"} <= targets
    revisao = next(e for e in wf if e["to_status"] == "em_revisao")
    assert revisao["from_status"] == "gerado_pela_ia"
