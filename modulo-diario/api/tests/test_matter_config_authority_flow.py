"""Integration tests: configurable act types, dynamic fields, authorities,
optimistic concurrency, non-duplication and the edition item_count fix.

These run against the real (in-memory SQLite) schema through the HTTP layer,
so they prove the *backend* — not just the frontend — enforces the rules.
"""
import uuid
from datetime import date

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.core.auth import get_current_user
from app.core.database import get_db
from app.main import app
from app.models.act_type import ActType
from app.models.authority import Authority
from app.models.organization import Organization
from app.models.user import User

STRICT_CONFIG = {
    "number_required": True,
    "year_required": True,
    "date_required": False,
    "responsible_required": True,
    "allow_free_responsible": True,
    "title_pattern": "PORTARIA Nº {number}/{year}",
    "dynamic_fields": [
        {
            "key": "cnpj_contratado", "label": "CNPJ/CPF do contratado",
            "type": "cpf_cnpj", "required": True, "placeholder": "00.000.000/0000-00",
            "help": "", "options": [],
        },
    ],
}
PERMISSIVE_CONFIG = None  # legacy behaviour: nothing mandatory


class _RoleName:
    def __init__(self, name):
        self.name = name


class _RoleObj:
    def __init__(self, name):
        self.role = _RoleName(name)


class _UserProxy:
    """Delegates the scalar attrs endpoints need to a real persisted User (so
    author_id FK holds) but serves user_roles from memory, avoiding any ORM
    lazy-load in async."""

    def __init__(self, user, role_names):
        self._user = user
        self._roles = [_RoleObj(r) for r in role_names]

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
    """Seed one org with an admin (ADMIN/REVISOR/DIAGRAMADOR), an author, two
    act types (strict + permissive) and two authorities (active + inactive)."""
    org_row = Organization(name="Prefeitura Teste", slug="pf-teste", cnpj="12345678000190")
    db_session.add(org_row)
    await db_session.flush()

    admin_row = User(name="Admin", email=f"admin_{uuid.uuid4().hex[:8]}@test", organization_id=org_row.id, is_active=True)
    autor_row = User(name="Autor", email=f"autor_{uuid.uuid4().hex[:8]}@test", organization_id=org_row.id, is_active=True)
    db_session.add_all([admin_row, autor_row])
    await db_session.flush()

    strict_type = ActType(name="Portaria", description="Portaria", config=STRICT_CONFIG)
    perm_type = ActType(name="Decreto", description="Decreto", config=PERMISSIVE_CONFIG)
    db_session.add_all([strict_type, perm_type])
    await db_session.flush()

    active_auth = Authority(
        organization_id=org_row.id, name="Oclécio de Freitas Meneses",
        role="Prefeito Municipal", is_active=True,
        valid_from=date(2025, 1, 1),
    )
    inactive_auth = Authority(
        organization_id=org_row.id, name="Ex-Prefeito", role="Prefeito",
        is_active=False, valid_until=date(2024, 12, 31),
    )
    db_session.add_all([active_auth, inactive_auth])
    await db_session.flush()

    class C:
        org = org_row
        admin = _UserProxy(admin_row, ["ADMIN", "REVISOR", "DIAGRAMADOR"])
        autor = _UserProxy(autor_row, ["AUTOR"])
        admin_id = admin_row.id
        autor_id = autor_row.id
        strict = strict_type
        permissive = perm_type
        active = active_auth
        inactive = inactive_auth

    yield C()
    app.dependency_overrides.clear()


def _use(ctx, session, user):
    app.dependency_overrides[get_db] = lambda: session
    app.dependency_overrides[get_current_user] = lambda: user


@pytest_asyncio.fixture
async def api_client(ctx, db_session):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield lambda user: _use(ctx, db_session, user) or ac


def _payload(at, number="01", **kw):
    payload = {
        "title": kw.get("title", "Ato de teste"),
        "summary": "Súmula",
        "act_type_id": str(at.id),
        "content_html": "<p>Corpo do ato</p>",
        "content_mode": "rich_text",
    }
    payload.update(kw)
    return payload


# ── Admin: friendly config save + rejection of invalid config ────────────────


@pytest.mark.anyio
async def test_admin_can_create_act_type_with_config(api_client, ctx):
    client = api_client(ctx.admin)
    resp = await client.post("/api/v1/admin/act-types", json={
        "name": "Edital",
        "config": {
            "number_required": True,
            "title_pattern": "EDITAL Nº {number}/{year}",
            "dynamic_fields": [{
                "key": "objeto", "label": "Objeto", "type": "text",
                "required": True, "options": [],
            }],
        },
    })
    assert resp.status_code == 201, resp.text
    cfg = resp.json()["config"]
    assert cfg["number_required"] is True
    assert [f["key"] for f in cfg["dynamic_fields"]] == ["objeto"]


@pytest.mark.anyio
async def test_admin_rejects_invalid_title_placeholder(api_client, ctx):
    client = api_client(ctx.admin)
    resp = await client.post("/api/v1/admin/act-types", json={
        "name": "Perigoso",
        "config": {"title_pattern": "PORTARIA {__import__('os')}"},
    })
    assert resp.status_code == 422


@pytest.mark.anyio
async def test_admin_rejects_invalid_dynamic_type(api_client, ctx):
    client = api_client(ctx.admin)
    resp = await client.post("/api/v1/admin/act-types", json={
        "name": "Perigoso2",
        "config": {"dynamic_fields": [{"key": "x", "label": "X", "type": "lua", "options": []}]},
    })
    assert resp.status_code == 422


@pytest.mark.anyio
async def test_author_cannot_use_admin_act_type_route(api_client, ctx):
    client = api_client(ctx.autor)
    resp = await client.post("/api/v1/admin/act-types", json={"name": "Bloqueado"})
    assert resp.status_code == 403


# ── Backend validation of dynamic fields on create ───────────────────────────


@pytest.mark.anyio
async def test_create_matter_missing_required_dynamic_field_is_422(api_client, ctx):
    client = api_client(ctx.admin)
    resp = await client.post("/api/v1/matters", json=_payload(
        ctx.strict,
        act_number="05", act_year=2026,
        responsible_id=str(ctx.active.id),
        # missing required dynamic field cnpj_contratado
    ))
    assert resp.status_code == 422
    detail = resp.json()["detail"]
    assert isinstance(detail, list)
    assert any(e["field"] == "cnpj_contratado" for e in detail)


@pytest.mark.anyio
async def test_create_matter_missing_required_number_is_422(api_client, ctx):
    client = api_client(ctx.admin)
    resp = await client.post("/api/v1/matters", json=_payload(
        ctx.strict,  # number_required
        responsible_id=str(ctx.active.id),
        metadata={"cnpj_contratado": "12.345.678/0001-90"},
    ))
    assert resp.status_code == 422
    assert any(e["field"] == "act_number" for e in resp.json()["detail"])


@pytest.mark.anyio
async def test_create_matter_missing_required_responsible_is_422(api_client, ctx):
    client = api_client(ctx.admin)
    resp = await client.post("/api/v1/matters", json=_payload(
        ctx.strict,
        act_number="05", act_year=2026,
        metadata={"cnpj_contratado": "12.345.678/0001-90"},
    ))
    assert resp.status_code == 422
    assert any(e["field"] == "responsible" for e in resp.json()["detail"])


@pytest.mark.anyio
async def test_create_matter_valid_stores_authority_snapshot(api_client, ctx):
    client = api_client(ctx.admin)
    resp = await client.post("/api/v1/matters", json=_payload(
        ctx.strict,
        act_number="05", act_year=2026,
        responsible_id=str(ctx.active.id),
        metadata={"cnpj_contratado": "12.345.678/0001-90"},
    ))
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["responsible_id"] == str(ctx.active.id)
    assert data["responsible_name"] == "Oclécio de Freitas Meneses"
    assert data["responsible_role"] == "Prefeito Municipal"
    assert data["metadata"]["cnpj_contratado"] == "12.345.678/0001-90"


@pytest.mark.anyio
async def test_create_with_inactive_authority_is_rejected(api_client, ctx):
    client = api_client(ctx.admin)
    resp = await client.post("/api/v1/matters", json=_payload(
        ctx.permissive, responsible_id=str(ctx.inactive.id),
    ))
    assert resp.status_code == 422


@pytest.mark.anyio
async def test_legacy_free_text_responsible_still_works(api_client, ctx):
    """Old matters that only used responsible_name/responsible_role keep working
    (responsible_id stays None → shown as 'responsável histórico')."""
    client = api_client(ctx.admin)
    resp = await client.post("/api/v1/matters", json=_payload(
        ctx.permissive, responsible_name="Maria Silva", responsible_role="Secretária",
    ))
    assert resp.status_code == 201
    data = resp.json()
    assert data["responsible_id"] is None
    assert data["responsible_name"] == "Maria Silva"


# ── Optimistic concurrency (If-Match / version) ──────────────────────────────


@pytest.mark.anyio
async def test_concurrent_edit_conflict_returns_409_and_keeps_latest(api_client, ctx):
    client = api_client(ctx.admin)
    created = (await client.post("/api/v1/matters", json=_payload(ctx.permissive, title="v1"))).json()
    mid = created["id"]
    assert created["version"] == 1

    # A saves (v1 -> v2)
    r = await client.patch(f"/api/v1/matters/{mid}", json={"title": "v2"}, headers={"If-Match": '"1-x"'})
    assert r.status_code == 200
    assert r.json()["version"] == 2

    # B still holds v1 and tries to save against it -> 409, latest preserved
    r2 = await client.patch(f"/api/v1/matters/{mid}", json={"title": "overwrite"}, headers={"If-Match": '"1-x"'})
    assert r2.status_code == 409

    latest = (await client.get(f"/api/v1/matters/{mid}")).json()
    assert latest["title"] == "v2"
    assert latest["version"] == 2


# ── Non-duplication (regression) ─────────────────────────────────────────────


@pytest.mark.anyio
async def test_autosave_does_not_duplicate_matter(api_client, ctx, db_session):
    from sqlalchemy import func, select

    from app.models.matter import Matter

    client = api_client(ctx.admin)
    created = (await client.post("/api/v1/matters", json=_payload(ctx.permissive, title="draft"))).json()
    mid = created["id"]

    # autosave patches keep the SAME matter id
    for i in range(3):
        up = await client.patch(
            f"/api/v1/matters/{mid}",
            json={"title": f"draft edited {i}", "summary": f"sum {i}"},
            headers={"If-Match": '"1-x"'} if i == 0 else {"If-Match": f'"{i+1}-x"'},
        )
        assert up.status_code == 200, up.text
        assert up.json()["id"] == mid

    sent = await client.post(f"/api/v1/matters/{mid}/submit-review")
    assert sent.status_code == 200

    count = (await db_session.execute(
        select(func.count()).select_from(Matter).where(Matter.id == uuid.UUID(mid))
    )).scalar_one()
    assert count == 1
    assert sent.json()["id"] == mid


# ── Permissions ──────────────────────────────────────────────────────────────


@pytest.mark.anyio
async def test_author_cannot_approve_own_matter(api_client, ctx):
    client = api_client(ctx.autor)
    created = (await client.post("/api/v1/matters", json=_payload(ctx.permissive, title="perm"))).json()
    mid = created["id"]
    assert (await client.post(f"/api/v1/matters/{mid}/submit-review")).status_code == 200
    # autor has no REVISOR/ADMIN -> forbidden
    assert (await client.post(f"/api/v1/matters/{mid}/approve")).status_code == 403


@pytest.mark.anyio
async def test_authority_is_tenant_scoped(api_client, ctx, db_session):
    # a second org
    org2 = Organization(name="Outro", slug=f"outro-{uuid.uuid4().hex[:6]}", cnpj=None)
    db_session.add(org2)
    await db_session.flush()
    authority_org2 = Authority(organization_id=org2.id, name="Outro Prefeito", is_active=True)
    db_session.add(authority_org2)
    await db_session.flush()

    # admin (org1) must not see org2's authority
    client = api_client(ctx.admin)
    resp = await client.get("/api/v1/authorities")
    assert resp.status_code == 200
    ids = [a["id"] for a in resp.json()]
    assert str(authority_org2.id) not in ids
    assert str(ctx.active.id) in ids


@pytest.mark.anyio
async def test_reject_requires_reason_and_resubmit_clears_it(api_client, ctx):
    client = api_client(ctx.admin)
    m = (await client.post("/api/v1/matters", json=_payload(ctx.permissive, title="Devolução"))).json()
    mid = m["id"]
    assert (await client.post(f"/api/v1/matters/{mid}/submit-review")).status_code == 200

    # returning without a reason is rejected
    no_reason = await client.post(f"/api/v1/matters/{mid}/reject", json={})
    assert no_reason.status_code == 422

    rejected = await client.post(f"/api/v1/matters/{mid}/reject", json={"reason": "Corrigir data e número"})
    assert rejected.status_code == 200, rejected.text
    body = rejected.json()
    assert body["status"] == "rejected"
    assert body["review_reason"] == "Corrigir data e número"

    # author fixes and resubmits (REJECTED -> REVIEW), reason is cleared
    fixed = await client.patch(f"/api/v1/matters/{mid}", json={"summary": "corrigido"}, headers={"If-Match": '"1-x"'})
    assert fixed.status_code == 200
    resub = await client.post(f"/api/v1/matters/{mid}/submit-review")
    assert resub.status_code == 200
    assert resub.json()["status"] == "review"
    assert resub.json()["review_reason"] is None


# ── Edition item_count fix ───────────────────────────────────────────────────


@pytest.mark.anyio
async def test_add_item_returns_updated_item_count(api_client, ctx):
    client = api_client(ctx.admin)

    m1 = (await client.post("/api/v1/matters", json=_payload(ctx.permissive, title="Matéria A"))).json()
    assert (await client.post(f"/api/v1/matters/{m1['id']}/submit-review")).status_code == 200
    assert (await client.post(f"/api/v1/matters/{m1['id']}/approve")).status_code == 200

    m2 = (await client.post("/api/v1/matters", json=_payload(ctx.permissive, title="Matéria B"))).json()
    assert (await client.post(f"/api/v1/matters/{m2['id']}/submit-review")).status_code == 200
    assert (await client.post(f"/api/v1/matters/{m2['id']}/approve")).status_code == 200

    edition_resp = await client.post("/api/v1/editions", json={
        "number": 7, "year": 2026, "type": "normal", "title": "Edição Teste",
        "publication_date": date.today().isoformat(),
    })
    assert edition_resp.status_code == 201, edition_resp.text
    edition = edition_resp.json()

    r1 = await client.post(f"/api/v1/editions/{edition['id']}/items",
                           json={"matter_id": m1["id"]})
    assert r1.status_code == 201, r1.text
    assert r1.json()["item_count"] == 1

    r2 = await client.post(f"/api/v1/editions/{edition['id']}/items",
                           json={"matter_id": m2["id"]})
    assert r2.status_code == 201, r2.text
    # item_count must already reflect the addition (no refetch needed)
    assert r2.json()["item_count"] == 2
