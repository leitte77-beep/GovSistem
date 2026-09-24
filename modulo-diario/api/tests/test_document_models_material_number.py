"""Testes de API: gerar minuta como matéria real e numeração transacional.

Cobrem: matéria rascunho a partir do modelo sem número; pendências bloqueiam a
criação (409, sem fingir sucesso); numeração por série (org/tipo/ano) idempotente
em reenvio, sequencial entre matérias e reiniciada por ano; permissões de
emissão de número (autor não emite).
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
    def user_roles(self):
        return self._roles


def _cfg_dict(titulo="PORTARIA DE TESTE"):
    return {
        "purpose": "Concessão de férias",
        "scope_document_type": "portaria",
        "document_title": titulo,
        "summary": "Concede férias a {{servidor}}.",
        "fields": [{"key": "servidor", "label": "Servidor", "type": "text", "required": True}],
        "sections": [
            {
                "id": "art1",
                "kind": "article",
                "text": "Concede férias ao servidor {{servidor}}.",
            }
        ],
    }


@pytest_asyncio.fixture
async def ctx(db_session):
    org = Organization(name="Prefeitura Teste", slug="pf-inc4", cnpj="12345678000194")
    db_session.add(org)
    await db_session.flush()

    admin_row = User(
        name="Admin",
        email=f"admin_{uuid.uuid4().hex[:8]}@t",
        organization_id=org.id,
        is_active=True,
    )
    autor_row = User(
        name="Autor",
        email=f"autor_{uuid.uuid4().hex[:8]}@t",
        organization_id=org.id,
        is_active=True,
    )
    db_session.add_all([admin_row, autor_row])
    await db_session.flush()

    at_row = ActType(
        name=f"Portaria-{uuid.uuid4().hex[:6]}", description="Portaria teste", config={}
    )
    db_session.add(at_row)
    await db_session.flush()

    class C:
        org_id = org.id
        act_type_id = at_row.id
        admin = _UserProxy(admin_row, ["ADMIN"])
        autor = _UserProxy(autor_row, ["AUTOR"])
        model_id = None

    yield C()
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def api_client(ctx, db_session):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        ac_ = ac

        def bind(user):
            app.dependency_overrides[get_db] = lambda: db_session
            app.dependency_overrides[get_current_user] = lambda: user
            return ac_

        yield bind


async def _create_approved_model(api_client, ctx, db_session) -> str:
    client = api_client(ctx.admin)
    r = await client.post(
        "/api/v1/document-models",
        json={
            "name": "Portaria de Férias",
            "slug": f"portaria-{uuid.uuid4().hex[:8]}",
            "config": _cfg_dict(),
        },
    )
    assert r.status_code == 201, r.text
    model_id = r.json()["id"]
    assert (
        await client.post(f"/api/v1/document-models/{model_id}/versions/1/submit")
    ).status_code == 200
    assert (
        await client.post(f"/api/v1/document-models/{model_id}/versions/1/approve")
    ).status_code == 200
    ctx.model_id = model_id
    return model_id


async def _material(api_client, ctx, user, model_id, values):
    client = api_client(user)
    return await client.post(
        f"/api/v1/document-models/{model_id}/versions/1/material",
        json={"act_type_id": str(ctx.act_type_id), "values": values},
    )


async def test_material_from_model_is_draft_without_number(api_client, ctx, db_session):
    model_id = await _create_approved_model(api_client, ctx, db_session)
    r = await _material(api_client, ctx, ctx.autor, model_id, {"servidor": "João"})
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["title"] == "PORTARIA DE TESTE"
    assert body["status"] == "draft"
    assert body["act_number"] is None  # rascunho sem número (usa id de rascunho)

    # Fase 5C: minuta gerada por modelo entra no fluxo como "gerado pela IA".
    got = await api_client(ctx.autor).get(f"/api/v1/matters/{body['id']}")
    assert got.status_code == 200
    assert got.json()["workflow_status"] == "gerado_pela_ia"


async def test_material_blocked_on_pending(api_client, ctx, db_session):
    model_id = await _create_approved_model(api_client, ctx, db_session)
    r = await _material(api_client, ctx, ctx.autor, model_id, {})  # servidor ausente
    assert r.status_code == 409
    assert any(p.get("field") == "servidor" for p in r.json()["detail"]["pending"])


async def test_numbering_idempotent_and_sequential(api_client, ctx, db_session):
    model_id = await _create_approved_model(api_client, ctx, db_session)
    m1 = (await _material(api_client, ctx, ctx.autor, model_id, {"servidor": "A"})).json()
    m2 = (await _material(api_client, ctx, ctx.autor, model_id, {"servidor": "B"})).json()

    adm = api_client(ctx.admin)
    n1 = (await adm.post("/api/v1/numbering/issue", json={"matter_id": m1["id"]})).json()
    assert n1["number"] == 1 and n1["already_assigned"] is False
    # Reenvio idempotente: mesmo número, não consome outro.
    n1b = (await adm.post("/api/v1/numbering/issue", json={"matter_id": m1["id"]})).json()
    assert n1b["number"] == 1 and n1b["already_assigned"] is True

    n2 = (await adm.post("/api/v1/numbering/issue", json={"matter_id": m2["id"]})).json()
    assert n2["number"] == 2


async def test_numbering_restarts_by_year(api_client, ctx, db_session):
    model_id = await _create_approved_model(api_client, ctx, db_session)
    m1 = (await _material(api_client, ctx, ctx.autor, model_id, {"servidor": "A"})).json()
    m2 = (await _material(api_client, ctx, ctx.autor, model_id, {"servidor": "B"})).json()
    adm = api_client(ctx.admin)  # criar APÓS os materiais (bind fixa o usuário)
    a = (
        await adm.post("/api/v1/numbering/issue", json={"matter_id": m1["id"], "year": 2025})
    ).json()
    b = (
        await adm.post("/api/v1/numbering/issue", json={"matter_id": m2["id"], "year": 2026})
    ).json()
    assert (a["number"], a["year"]) == (1, 2025)
    assert (b["number"], b["year"]) == (1, 2026)  # série independente por ano


async def test_author_cannot_issue_number(api_client, ctx, db_session):
    model_id = await _create_approved_model(api_client, ctx, db_session)
    m = (await _material(api_client, ctx, ctx.autor, model_id, {"servidor": "A"})).json()
    r = await api_client(ctx.autor).post("/api/v1/numbering/issue", json={"matter_id": m["id"]})
    assert r.status_code == 403


async def test_list_materials_by_type_with_derived_states(api_client, ctx, db_session):
    model_id = await _create_approved_model(api_client, ctx, db_session)
    m = (await _material(api_client, ctx, ctx.autor, model_id, {"servidor": "A"})).json()

    client = api_client(ctx.admin)  # criar depois dos materiais (bind fixa usuário)
    r = await client.get("/api/v1/document-models/materials?document_type=portaria")
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 1
    item = body["items"][0]
    assert item["id"] == m["id"]
    assert item["editorial_status"] == "draft"
    # Ainda não há edição → sem assinatura e não publicado (fatos reais).
    assert item["signature_status"] == "none"
    assert item["publication_status"] == "not_published"

    signed = (
        await client.get(
            "/api/v1/document-models/materials?document_type=portaria&signature=signed"
        )
    ).json()
    assert signed["total"] == 0
    published = (
        await client.get(
            "/api/v1/document-models/materials?document_type=portaria&publication=published"
        )
    ).json()
    assert published["total"] == 0
    outro = (await client.get("/api/v1/document-models/materials?document_type=edital")).json()
    assert outro["total"] == 0
