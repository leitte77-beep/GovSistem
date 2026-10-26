"""Sincronização interna e idempotência (SSO da plataforma)."""

from __future__ import annotations

import uuid

import jwt

from app.core.config import settings


async def test_sync_organization_e_user(client, internal_headers):
    org_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())
    chave = str(uuid.uuid4())
    org = await client.post(
        "/api/govsaude/v1/internal/sync-organization",
        json={
            "organization_id": org_id,
            "name": "Prefeitura Sync",
            "slug": "prefeitura-sync",
            "uf": "PR",
        },
        headers={**internal_headers, "Idempotency-Key": chave},
    )
    assert org.status_code == 200, org.text
    assert org.json()["organization_id"] == org_id

    repetida = await client.post(
        "/api/govsaude/v1/internal/sync-organization",
        json={
            "organization_id": org_id,
            "name": "Prefeitura Sync",
            "slug": "prefeitura-sync",
            "uf": "PR",
        },
        headers={**internal_headers, "Idempotency-Key": chave},
    )
    assert repetida.status_code == 200
    assert repetida.json()["organization_id"] == org_id

    usuario = await client.post(
        "/api/govsaude/v1/internal/sync-user",
        json={
            "user_id": user_id,
            "organization_id": org_id,
            "name": "Servidor Sync",
            "email": "sync@example.com",
            "is_active": True,
            "roles": ["medico"],
        },
        headers=internal_headers,
    )
    assert usuario.status_code == 200, usuario.text
    assert usuario.json()["user_id"] == user_id

    payload = {
        "sub": user_id,
        "organization_id": org_id,
        "roles": ["medico"],
        "module": "govsaude",
        "type": "module_access",
        "iss": "govsistem",
    }
    token = jwt.encode(
        payload,
        settings.SAAS_JWT_SECRET.get_secret_value(),
        algorithm=settings.ALGORITHM,
    )
    me = await client.get(
        "/api/govsaude/v1/auth/me", headers={"Authorization": f"Bearer {token}"}
    )
    assert me.status_code == 200, me.text
    assert me.json()["email"] == "sync@example.com"
    assert [g["codigo"] for g in me.json()["grupos"]] == ["medico"]


async def test_internal_sem_chave_401(client):
    resposta = await client.post(
        "/api/govsaude/v1/internal/sync-organization",
        json={"organization_id": str(uuid.uuid4()), "name": "X"},
    )
    assert resposta.status_code == 401
