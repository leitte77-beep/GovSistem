from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from starlette.requests import Request

from app.core.tenant import _candidate_slug_from_host, resolve_tenant_from_domain


def _request(
    host: str,
    origin: str | None = None,
    tenant_slug: str | None = None,
) -> Request:
    headers = [(b"host", host.encode())]
    if origin:
        headers.append((b"origin", origin.encode()))
    if tenant_slug:
        headers.append((b"x-tenant-slug", tenant_slug.encode()))
    return Request(
        {
            "type": "http",
            "method": "GET",
            "scheme": "https",
            "server": (host, 443),
            "path": "/",
            "query_string": b"",
            "headers": headers,
        }
    )


def _result(value):
    result = MagicMock()
    result.scalar_one_or_none.return_value = value
    return result


def _domain_aware_db(custom_domain: str, tenant_domain, organization):
    db = AsyncMock()

    async def execute(statement):
        values = statement.compile().params.values()
        if custom_domain in values:
            return _result(tenant_domain)
        if tenant_domain.organization_id in values:
            return _result(organization)
        return _result(None)

    db.execute.side_effect = execute
    return db


def _mapped_db(domain_map: dict, organization_map: dict):
    db = AsyncMock()

    async def execute(statement):
        values = set(statement.compile().params.values())
        for domain, tenant_domain in domain_map.items():
            if domain in values:
                return _result(tenant_domain)
        for key, organization in organization_map.items():
            if key in values:
                return _result(organization)
        return _result(None)

    db.execute.side_effect = execute
    return db


def test_candidate_slug_only_accepts_one_label_under_trusted_base():
    assert _candidate_slug_from_host("farol.govsistem.com.br") == "farol"
    assert _candidate_slug_from_host("farol.attacker.example") is None
    assert _candidate_slug_from_host("nested.farol.govsistem.com.br") is None
    assert _candidate_slug_from_host("diario.govsistem.com.br") is None


@pytest.mark.anyio
async def test_attacker_origin_is_ignored_and_custom_domain_resolution_is_preserved():
    tenant_domain = SimpleNamespace(organization_id="org-id")
    organization = SimpleNamespace(id="org-id", slug="farol")
    db = _domain_aware_db(
        "diario.prefeitura.example", tenant_domain, organization
    )

    resolved = await resolve_tenant_from_domain(
        _request(
            "diario.prefeitura.example",
            "https://farol.attacker.example",
        ),
        db,
    )

    assert resolved is organization
    assert db.execute.await_count == 2


@pytest.mark.anyio
async def test_custom_domain_is_resolved_from_origin_behind_official_api_host():
    tenant_domain = SimpleNamespace(organization_id="org-id")
    organization = SimpleNamespace(id="org-id", slug="farol")
    db = _domain_aware_db(
        "diario.prefeitura.example", tenant_domain, organization
    )

    resolved = await resolve_tenant_from_domain(
        _request(
            "api.govsistem.com.br",
            "https://diario.prefeitura.example",
        ),
        db,
    )

    assert resolved is organization


@pytest.mark.anyio
async def test_registered_custom_host_wins_over_a_different_custom_origin():
    farol_td = SimpleNamespace(organization_id="farol-id")
    outro_td = SimpleNamespace(organization_id="outro-id")
    farol = SimpleNamespace(id="farol-id", slug="farol")
    outro = SimpleNamespace(id="outro-id", slug="outro")
    db = _mapped_db(
        {
            "diario.farol.example": farol_td,
            "diario.outro.example": outro_td,
        },
        {"farol-id": farol, "outro-id": outro},
    )

    resolved = await resolve_tenant_from_domain(
        _request(
            "diario.farol.example",
            "https://diario.outro.example",
            tenant_slug="outro",
        ),
        db,
    )

    assert resolved is farol


@pytest.mark.anyio
async def test_official_tenant_host_wins_over_a_custom_origin():
    farol = SimpleNamespace(id="farol-id", slug="farol")
    outro_td = SimpleNamespace(organization_id="outro-id")
    outro = SimpleNamespace(id="outro-id", slug="outro")
    db = _mapped_db(
        {"diario.outro.example": outro_td},
        {"farol": farol, "outro-id": outro},
    )

    resolved = await resolve_tenant_from_domain(
        _request(
            "farol.govsistem.com.br",
            "https://diario.outro.example",
        ),
        db,
    )

    assert resolved is farol


@pytest.mark.anyio
async def test_x_tenant_is_ignored_on_an_unregistered_custom_host():
    farol = SimpleNamespace(id="farol-id", slug="farol")
    db = _mapped_db({}, {"farol": farol})

    resolved = await resolve_tenant_from_domain(
        _request("unregistered.custom.example", tenant_slug="farol"),
        db,
    )

    assert resolved is None
