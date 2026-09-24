"""Backend tests for the centralized AI (DeepSeek) configuration and client.

Covers the acceptance-critical guarantees that do not require a live network:
  * masked reads never return the plaintext key;
  * blank api_key preserves the existing key; explicit replace/remove/disable;
  * authorization (users without ai.manage are blocked at every endpoint);
  * audit events are recorded without the secret;
  * the DeepSeek client parses/validates structured output and maps failures
    to stable typed errors (using httpx.MockTransport, no real key/network).

Per-org persistence is exercised through the real in-memory schema via HTTP.
"""

from __future__ import annotations

import json
import uuid

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient, MockTransport, Response
from pydantic import BaseModel, Field

from app.core.auth import get_current_user
from app.core.database import get_db
from app.main import app
from app.models.audit_event import AuditEvent
from app.models.enums import AuditAction
from app.models.organization import Organization
from app.models.user import User
from app.schemas.ai_config import AiConfigOut
from app.services.ai import config_store
from app.services.ai.deepseek_client import DeepSeekClient
from app.services.ai.errors import (
    AiAuthError,
    AiDisabledError,
    AiInvalidResponseError,
    AiNotConfiguredError,
    AiProviderUnavailableError,
    AiRateLimitError,
    AiTimeoutError,
    AiTruncatedResponseError,
)


class _RoleName:
    def __init__(self, name: str):
        self.name = name


class _RoleObj:
    def __init__(self, name: str):
        self.role = _RoleName(name)


class _UserProxy:
    """Real persisted User for FK integrity; roles served from memory."""

    def __init__(self, user: User, role_names: list[str]):
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
    org = Organization(name="Prefeitura Teste", slug="pf-ai", cnpj="12345678000191")
    db_session.add(org)
    await db_session.flush()

    admin_row = User(
        name="Admin",
        email=f"admin_{uuid.uuid4().hex[:8]}@test",
        organization_id=org.id,
        is_active=True,
    )
    consulta_row = User(
        name="Consulta",
        email=f"cons_{uuid.uuid4().hex[:8]}@test",
        organization_id=org.id,
        is_active=True,
    )
    db_session.add_all([admin_row, consulta_row])
    await db_session.flush()

    class C:
        org_id = org.id
        admin = _UserProxy(admin_row, ["ADMIN"])
        consulta = _UserProxy(consulta_row, ["CONSULTA"])

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


# ── Authorization ───────────────────────────────────────────────────────────


async def test_config_endpoints_require_permission(api_client, ctx):
    # A CONSULTA user has no ai.manage/ai.run permission.
    client = api_client(ctx.consulta)
    cases = [
        ("GET", "/api/v1/ai/config", None),
        ("PUT", "/api/v1/ai/config", {}),
        ("POST", "/api/v1/ai/config/key", {"api_key": "sk-abcdefgh123456"}),
        ("DELETE", "/api/v1/ai/config/key", None),
        ("POST", "/api/v1/ai/config/disable", None),
        ("POST", "/api/v1/ai/config/test-connection", {}),
    ]
    for method, path, body in cases:
        resp = await client.request(method, path, json=body)
        assert resp.status_code == 403, f"{method} {path} should be 403"


# ── Config CRUD & secrecy (real DB through HTTP) ───────────────────────────


async def test_get_default_config_never_contains_key(api_client, ctx):
    client = api_client(ctx.admin)
    resp = await client.get("/api/v1/ai/config")
    assert resp.status_code == 200
    body = AiConfigOut.model_validate(resp.json())
    assert body.configured is False
    assert body.key_masked is None
    assert body.provider == "deepseek"
    assert body.model == "deepseek-v4-flash"
    assert "api.deepseek.com" in body.endpoint
    assert "api_key_ciphertext" not in resp.text


async def test_put_sets_key_and_masks_it(api_client, ctx, db_session):
    secret = "sk-test-abcdef-1234567890"
    client = api_client(ctx.admin)
    resp = await client.put("/api/v1/ai/config", json={"api_key": secret})
    assert resp.status_code == 200
    body = resp.json()
    assert body["configured"] is True
    assert body["key_masked"] == "****7890"
    assert secret not in resp.text  # never leaks anywhere in the response

    cfg = await config_store.get_config(db_session, ctx.org_id)
    assert cfg is not None and cfg.api_key_ciphertext
    assert secret not in cfg.api_key_ciphertext  # encrypted at rest
    assert await config_store.get_active_key(db_session, ctx.org_id) == secret


async def test_blank_key_preserves_existing(api_client, ctx, db_session):
    secret = "sk-preserve-123456"
    await config_store.set_api_key(db_session, ctx.org_id, secret)
    client = api_client(ctx.admin)
    resp = await client.put("/api/v1/ai/config", json={"max_tokens": 2048, "timeout_seconds": 90})
    assert resp.status_code == 200
    assert resp.json()["configured"] is True
    assert resp.json()["key_masked"] == "****3456"
    assert await config_store.get_active_key(db_session, ctx.org_id) == secret


async def test_explicit_replace_and_remove_are_audited(api_client, ctx, db_session):
    await config_store.set_api_key(db_session, ctx.org_id, "sk-old-111111")
    client = api_client(ctx.admin)

    resp = await client.post("/api/v1/ai/config/key", json={"api_key": "sk-new-999999999"})
    assert resp.status_code == 200
    assert resp.json()["key_masked"] == "****9999"
    assert await config_store.get_active_key(db_session, ctx.org_id) == "sk-new-999999999"

    actions = await _audit_actions(db_session, ctx.org_id)
    assert AuditAction.AI_KEY_REPLACED in actions
    serialized = await _audit_serialized(db_session, ctx.org_id)
    assert "sk-new-999999999" not in serialized

    resp = await client.delete("/api/v1/ai/config/key")
    assert resp.status_code == 204
    cfg = await config_store.get_config(db_session, ctx.org_id)
    assert cfg is not None and cfg.api_key_ciphertext is None
    assert (await _audit_actions(db_session, ctx.org_id)).count(AuditAction.AI_KEY_REMOVED) == 1


async def test_disable(api_client, ctx, db_session):
    await config_store.set_api_key(db_session, ctx.org_id, "sk-keep-222222")
    client = api_client(ctx.admin)
    resp = await client.post("/api/v1/ai/config/disable")
    assert resp.status_code == 200
    assert resp.json()["enabled"] is False
    cfg = await config_store.get_config(db_session, ctx.org_id)
    assert cfg is not None and cfg.enabled is False
    assert AuditAction.AI_CONFIG_DISABLED in await _audit_actions(db_session, ctx.org_id)


# ── DeepSeek client (mocked transport) ─────────────────────────────────────


class _Echo(BaseModel):
    assunto: str = Field(min_length=1)
    quantidade: int


def test_client_parses_valid_json():
    transport = MockTransport(
        lambda req: Response(
            200,
            json={
                "choices": [{"message": {"content": '{"assunto": "ferias", "quantidade": 30}'}}],
                "usage": {"prompt_tokens": 5, "completion_tokens": 3, "total_tokens": 8},
                "model": "deepseek-v4-flash",
            },
        )
    )
    import asyncio

    client = DeepSeekClient("sk-test", transport=transport)

    async def run():
        return await client.complete_json(
            [
                {"role": "system", "content": "Output JSON."},
                {"role": "user", "content": "ok"},
            ],
            schema=_Echo,
        )

    data, meta = asyncio.run(run())
    assert data.assunto == "ferias"
    assert data.quantidade == 30
    assert meta["usage"]["total_tokens"] == 8


def test_client_can_disable_thinking_for_structured_extraction():
    seen: dict = {}

    def handler(req):
        seen.update(json.loads(req.content))
        return Response(200, json={"choices": [{"message": {"content": '{"ok": true}'}}]})

    transport = MockTransport(handler)
    import asyncio

    client = DeepSeekClient("sk-test", transport=transport)

    asyncio.run(
        client.complete_json(
            [{"role": "system", "content": "Retorne JSON."}],
            disable_thinking=True,
        )
    )

    assert seen["thinking"] == {"type": "disabled"}


def test_client_rejects_schema_violation():
    content = '{"assunto": "x", "quantidade": "nao_int"}'
    transport = MockTransport(
        lambda req: Response(
            200, json={"choices": [{"message": {"content": content}}]}
        )
    )
    import asyncio

    client = DeepSeekClient("sk-test", transport=transport)

    async def run():
        await client.complete_json(
            [
                {"role": "system", "content": "Output JSON."},
                {"role": "user", "content": "ok"},
            ],
            schema=_Echo,
        )

    with pytest.raises(AiInvalidResponseError):
        asyncio.run(run())


@pytest.mark.parametrize(
    "content",
    [
        '```json\n{"assunto": "ferias", "quantidade": 30}\n```',
        '```\n{"assunto": "ferias", "quantidade": 30}\n```',
        'Claro! Segue o JSON:\n{"assunto": "ferias", "quantidade": 30}\nEspero ter ajudado.',
    ],
)
def test_client_parses_json_wrapped_or_with_surrounding_text(content):
    transport = MockTransport(
        lambda req: Response(200, json={"choices": [{"message": {"content": content}}]})
    )
    import asyncio

    client = DeepSeekClient("sk-test", transport=transport)

    async def run():
        return await client.complete_json(
            [
                {"role": "system", "content": "Output JSON."},
                {"role": "user", "content": "ok"},
            ],
            schema=_Echo,
        )

    data, _meta = asyncio.run(run())
    assert data.assunto == "ferias"
    assert data.quantidade == 30


def test_client_reports_truncated_response_as_typed_error():
    transport = MockTransport(
        lambda req: Response(
            200,
            json={
                "choices": [
                    {"message": {"content": ""}, "finish_reason": "length"}
                ],
                "usage": {"completion_tokens": 8192},
            },
        )
    )
    import asyncio

    client = DeepSeekClient("sk-test", transport=transport)

    async def run():
        await client.complete_json(
            [{"role": "system", "content": "Output JSON."}, {"role": "user", "content": "ok"}]
        )

    with pytest.raises(AiTruncatedResponseError):
        asyncio.run(run())


def test_client_reports_truncated_partial_json_as_typed_error():
    transport = MockTransport(
        lambda req: Response(
            200,
            json={
                "choices": [
                    {"message": {"content": '{"a": 1, "b":'}, "finish_reason": "length"}
                ]
            },
        )
    )
    import asyncio

    client = DeepSeekClient("sk-test", transport=transport)

    async def run():
        await client.complete_json(
            [{"role": "system", "content": "Output JSON."}, {"role": "user", "content": "ok"}]
        )

    with pytest.raises(AiTruncatedResponseError):
        asyncio.run(run())


def test_client_rejects_non_json_content():
    transport = MockTransport(
        lambda req: Response(200, json={"choices": [{"message": {"content": "sem json aqui"}}]})
    )
    import asyncio

    client = DeepSeekClient("sk-test", transport=transport)

    async def run():
        await client.complete_json(
            [{"role": "system", "content": "Output JSON."}, {"role": "user", "content": "ok"}]
        )

    with pytest.raises(AiInvalidResponseError):
        asyncio.run(run())


@pytest.mark.parametrize(
    "status,expected",
    [
        (401, AiAuthError),
        (403, AiAuthError),
        (429, AiRateLimitError),
        (503, AiProviderUnavailableError),
    ],
)
def test_client_maps_http_errors(status, expected):
    transport = MockTransport(lambda req: Response(status, text="provider error"))
    import asyncio

    client = DeepSeekClient("sk-test", transport=transport, max_retries=0)

    async def run():
        await client.minimal_ping()

    with pytest.raises(expected):
        asyncio.run(run())


def test_minimal_ping_rejects_empty_content_as_typed_error():
    transport = MockTransport(
        lambda req: Response(200, json={"choices": [{"message": {"content": ""}}]})
    )
    import asyncio

    client = DeepSeekClient("sk-test", transport=transport, max_retries=0)

    async def run():
        await client.minimal_ping()

    with pytest.raises(AiInvalidResponseError):
        asyncio.run(run())


def test_minimal_ping_rejects_non_json_content_as_typed_error():
    transport = MockTransport(
        lambda req: Response(200, json={"choices": [{"message": {"content": "pong"}}]})
    )
    import asyncio

    client = DeepSeekClient("sk-test", transport=transport, max_retries=0)

    async def run():
        await client.minimal_ping()

    with pytest.raises(AiInvalidResponseError):
        asyncio.run(run())


def test_client_retries_transient_then_unavailable():
    calls = {"n": 0}

    def handler(req):
        calls["n"] += 1
        return Response(503, text="overloaded")

    transport = MockTransport(handler)
    import asyncio

    client = DeepSeekClient("sk-test", transport=transport, max_retries=2)

    async def run():
        await client.minimal_ping()

    with pytest.raises(AiProviderUnavailableError):
        asyncio.run(run())
    assert calls["n"] == 3  # 1 initial + 2 retries


def test_client_maps_timeout_after_retries():
    from httpx import ReadTimeout

    def handler(req):
        raise ReadTimeout("timed out")

    transport = MockTransport(handler)
    import asyncio

    client = DeepSeekClient("sk-test", transport=transport, max_retries=1)

    async def run():
        await client.minimal_ping()

    with pytest.raises(AiTimeoutError):
        asyncio.run(run())


# ── config_store get_active_key guards ──────────────────────────────────────


async def test_active_key_raises_when_not_configured_or_disabled(db_session, ctx):
    with pytest.raises(AiNotConfiguredError):
        await config_store.get_active_key(db_session, ctx.org_id)

    await config_store.set_api_key(db_session, ctx.org_id, "sk-guard-123456")
    await config_store.upsert_config(db_session, ctx.org_id, enabled=False)
    with pytest.raises(AiDisabledError):
        await config_store.get_active_key(db_session, ctx.org_id)


# ── helpers ─────────────────────────────────────────────────────────────────


async def _audit_actions(db_session, org_id) -> list:
    from sqlalchemy import select

    rows = (
        await db_session.execute(select(AuditEvent).where(AuditEvent.organization_id == org_id))
    ).scalars().all()
    return [r.action for r in rows]


async def _audit_serialized(db_session, org_id) -> str:
    import json

    from sqlalchemy import select

    rows = (
        await db_session.execute(select(AuditEvent).where(AuditEvent.organization_id == org_id))
    ).scalars().all()
    return json.dumps(
        [{"a": r.action, "d": r.description, "m": r.extra_metadata} for r in rows]
    )
