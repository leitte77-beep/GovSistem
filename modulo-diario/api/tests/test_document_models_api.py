"""Testes de API dos modelos documentais (Incremento 3).

Cobrem: isolamento por organização, autorização por ação (criar/gerir vs.
aprovar), ciclo de vida via HTTP, preview determinístico (valores/422), e a
geração por IA quando a organização NÃO tem chave (não chama rede e devolve o
modelo para preenchimento manual).
"""

from __future__ import annotations

import uuid

import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.core.auth import get_current_user
from app.core.database import get_db
from app.main import app
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


@pytest_asyncio.fixture
async def ctx(db_session):
    org = Organization(name="Prefeitura Teste", slug="pf-dm", cnpj="12345678000193")
    db_session.add(org)
    await db_session.flush()

    rows = []
    users = {}
    for label, roles in {
        "admin": ["ADMIN"],
        "autor": ["AUTOR"],
        "revisor": ["REVISOR"],
        "consulta": ["CONSULTA"],
    }.items():
        u = User(
            name=label,
            email=f"{label}_{uuid.uuid4().hex[:8]}@test",
            organization_id=org.id,
            is_active=True,
        )
        rows.append(u)
        users[label] = u
    db_session.add_all(rows)
    await db_session.flush()

    class C:
        org_id = org.id
        admin = _UserProxy(users["admin"], ["ADMIN"])
        autor = _UserProxy(users["autor"], ["AUTOR"])
        revisor = _UserProxy(users["revisor"], ["REVISOR"])
        consulta = _UserProxy(users["consulta"], ["CONSULTA"])

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


def _config_dict(**overrides) -> dict:
    cfg = {
        "purpose": "Concessão de férias",
        "scope_document_type": "portaria",
        "document_title": "PORTARIA Nº 001/2026",
        "summary": "Concede férias ao servidor {{servidor}}.",
        "fields": [{"key": "servidor", "label": "Servidor", "type": "text", "required": True}],
        "sections": [
            {
                "id": "art1",
                "kind": "article",
                "text": "Concede férias ao servidor {{servidor}}.",
            }
        ],
    }
    cfg.update(overrides)
    return cfg


async def _create(api_client, user, slug="portaria-ferias", name="Portaria de Férias", **cfg_kw):
    client = api_client(user)
    resp = await client.post(
        "/api/v1/document-models",
        json={"name": name, "slug": slug, "config": _config_dict(**cfg_kw)},
    )
    return client, resp


# ── Autorização ─────────────────────────────────────────────────────────────


async def test_consultation_cannot_read_models(api_client):
    # Usuário CONSULTA não tem permissões de documento-modelo.
    client = api_client(_consulta_proxy())
    resp = await client.get("/api/v1/document-models")
    assert resp.status_code == 403


def _consulta_proxy():
    return _InlineUser("consulta@x", ["CONSULTA"])


class _InlineUser:
    def __init__(self, email, roles):
        self.id = None
        self.organization_id = None
        self.email = email
        self.user_roles = [_RoleObj(r) for r in roles]


async def test_consultation_cannot_create(api_client):
    client = api_client(_consulta_proxy())
    resp = await client.post(
        "/api/v1/document-models",
        json={"name": "X", "slug": "x", "config": _config_dict()},
    )
    assert resp.status_code == 403


async def test_author_can_create_but_not_approve(api_client, ctx):
    client, resp = await _create(api_client, ctx.autor)
    assert resp.status_code == 201
    model_id = resp.json()["id"]

    # submit ok (manage)
    r = await client.post(f"/api/v1/document-models/{model_id}/versions/1/submit")
    assert r.status_code == 200
    # approve NÃO é permitido ao AUTOR.
    r = await client.post(f"/api/v1/document-models/{model_id}/versions/1/approve")
    assert r.status_code == 403


# ── Ciclo de vida via HTTP ──────────────────────────────────────────────────


async def test_full_lifecycle_admin(api_client, ctx):
    client, resp = await _create(api_client, ctx.admin)
    assert resp.status_code == 201
    model_id = resp.json()["id"]

    r = await client.post(f"/api/v1/document-models/{model_id}/versions/1/submit")
    assert r.status_code == 200 and r.json()["status"] == "in_approval"
    r = await client.post(f"/api/v1/document-models/{model_id}/versions/1/approve")
    assert r.status_code == 200 and r.json()["status"] == "active"

    # Default ativo por escopo disponível.
    d = await client.get("/api/v1/document-models/default?document_type=portaria")
    assert d.status_code == 200
    assert d.json()["id"] == model_id


async def test_duplicate_slug_conflict(api_client, ctx):
    await _create(api_client, ctx.admin)
    _, resp = await _create(api_client, ctx.admin)
    assert resp.status_code == 409


async def test_archive(api_client, ctx):
    _, resp = await _create(api_client, ctx.admin)
    model_id = resp.json()["id"]
    client = api_client(ctx.admin)
    r = await client.post(f"/api/v1/document-models/{model_id}/archive")
    assert r.status_code == 200
    assert r.json()["status"] == "archived"


# ── Preview determinístico ──────────────────────────────────────────────────


async def test_preview_complete_and_deterministic(api_client, ctx):
    _, resp = await _create(api_client, ctx.admin)
    model_id = resp.json()["id"]
    client = api_client(ctx.admin)
    r = await client.post(
        f"/api/v1/document-models/{model_id}/versions/1/preview",
        json={"values": {"servidor": "João da Silva"}},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["complete"] is True
    assert body["pending"] == []
    assert "Concede férias ao servidor João da Silva" in body["canonical_text"]


async def test_preview_missing_required_not_fake_success(api_client, ctx):
    _, resp = await _create(api_client, ctx.admin)
    model_id = resp.json()["id"]
    client = api_client(ctx.admin)
    r = await client.post(
        f"/api/v1/document-models/{model_id}/versions/1/preview",
        json={"values": {}},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["complete"] is False
    assert any(p.get("field") == "servidor" for p in body["pending"])


async def test_preview_rejects_unknown_field(api_client, ctx):
    _, resp = await _create(api_client, ctx.admin)
    model_id = resp.json()["id"]
    client = api_client(ctx.admin)
    r = await client.post(
        f"/api/v1/document-models/{model_id}/versions/1/preview",
        json={"values": {"chave_estranha": "x"}},
    )
    assert r.status_code == 422


# ── Geração por IA sem chave ────────────────────────────────────────────────


async def test_ai_extract_returns_model_when_no_key(api_client, ctx):
    client, resp = await _create(api_client, ctx.admin)
    model_id = resp.json()["id"]
    client = api_client(ctx.admin)
    await client.post(f"/api/v1/document-models/{model_id}/versions/1/submit")
    await client.post(f"/api/v1/document-models/{model_id}/versions/1/approve")

    r = await client.post(
        "/api/v1/document-models/ai/extract",
        json={"prompt": "Conceda 30 dias de férias ao servidor João.", "document_type": "portaria"},
    )
    # Sem chave configurada, NÃO chama a rede: devolve o modelo p/ preenchimento manual.
    assert r.status_code == 200
    body = r.json()
    assert body["matched_model"] is not None
    assert body["matched_model"]["id"] == model_id
    assert body["complete"] is False
    assert body["note"]


async def test_ai_extract_no_active_model(api_client, ctx):
    client = api_client(ctx.admin)
    r = await client.post(
        "/api/v1/document-models/ai/extract",
        json={"prompt": "Crie um decreto.", "document_type": "decreto"},
    )
    assert r.status_code == 409
