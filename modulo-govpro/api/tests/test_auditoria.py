"""Testes do painel de auditoria (GET /auditoria) — leitura estrita da trilha
append-only, restrita a AUDITOR/ADMIN, com filtros e isolamento de tenant.
"""

from datetime import datetime, timedelta, timezone

import jwt
from sqlalchemy import select

from app.core.config import settings
from app.models.enums import RoleName
from app.models.role import Role
from app.models.user_role import UserRole
from app.services.auditoria import registrar


def _token(user, org_id) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "roles": ["SERVIDOR"],
        "type": "module_access",
        "organization_id": str(org_id),
        "iat": now,
        "exp": now + timedelta(minutes=30),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.ALGORITHM)


async def _conceder_papel(db, user, papel: str) -> None:
    role = (await db.execute(select(Role).where(Role.name == papel))).scalar_one()
    db.add(UserRole(user_id=user.id, role_id=role.id))
    await db.commit()


async def test_sem_papel_de_auditoria_recebe_403(cenario, client):
    token = _token(cenario["user"], cenario["tenant_id"])
    res = await client.get(
        "/api/govpro/v1/auditoria", headers={"Authorization": f"Bearer {token}"}
    )
    assert res.status_code == 403


async def test_auditor_le_eventos_do_proprio_tenant(cenario, client):
    db = cenario["db"]
    tenant_id = cenario["tenant_id"]

    await registrar(
        db,
        tenant_id=tenant_id,
        action="CRIACAO",
        entity="processo",
        entity_id="abc-123",
        actor_user_id=cenario["user"].id,
    )
    await registrar(
        db,
        tenant_id=tenant_id,
        action="EDICAO",
        entity="documento",
        entity_id="doc-1",
        actor_user_id=cenario["user"].id,
    )
    await db.commit()

    await _conceder_papel(db, cenario["user"], RoleName.AUDITOR.value)
    token = _token(cenario["user"], tenant_id)

    res = await client.get(
        "/api/govpro/v1/auditoria", headers={"Authorization": f"Bearer {token}"}
    )
    assert res.status_code == 200
    eventos = res.json()
    assert len(eventos) >= 2
    assert {"CRIACAO", "EDICAO"} <= {e["action"] for e in eventos}

    res = await client.get(
        "/api/govpro/v1/auditoria?entity=documento",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    filtrados = res.json()
    assert filtrados and all(e["entity"] == "documento" for e in filtrados)


async def test_auditoria_isolada_por_tenant(cenario, client, db_session):
    from app.models.organization import Organization
    from app.models.user import User

    db = cenario["db"]
    tenant_id = cenario["tenant_id"]

    await registrar(
        db,
        tenant_id=tenant_id,
        action="CRIACAO",
        entity="processo",
        entity_id="somente-tenant-a",
        actor_user_id=cenario["user"].id,
    )
    await db.commit()

    outra_org = Organization(name="Outro Ente", slug="outro-ente", is_active=True)
    db_session.add(outra_org)
    await db_session.flush()
    outro_user = User(
        organization_id=outra_org.id,
        name="Auditor B",
        email="auditor-b@teste.local",
        is_active=True,
        password_hash=None,
    )
    db_session.add(outro_user)
    await db_session.flush()
    await _conceder_papel(db_session, outro_user, RoleName.AUDITOR.value)

    token_b = _token(outro_user, outra_org.id)
    res = await client.get(
        "/api/govpro/v1/auditoria", headers={"Authorization": f"Bearer {token_b}"}
    )
    assert res.status_code == 200
    assert res.json() == []


async def test_auditoria_exige_autenticacao(client):
    res = await client.get("/api/govpro/v1/auditoria")
    assert res.status_code == 401
