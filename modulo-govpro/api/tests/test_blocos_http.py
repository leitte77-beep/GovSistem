"""Testes HTTP dos blocos de assinatura (listagem/detalhe) — Fase web-admin."""

from datetime import datetime, timedelta, timezone

import jwt
from sqlalchemy import select

from app.core.config import settings
from app.models.dominio import TipoProcesso
from app.models.enums import RoleName
from app.models.role import Role
from app.models.user_role import UserRole
from app.services import bloco_assinatura, documento
from app.services.autuacao import autuar


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


async def _autuar(cenario):
    db = cenario["db"]
    tipo = (
        await db.execute(
            select(TipoProcesso).where(
                TipoProcesso.tenant_id == cenario["tenant_id"], TipoProcesso.codigo == "REQ_GERAL"
            )
        )
    ).scalar_one()
    return await autuar(
        db,
        cenario["tenant_id"],
        cenario["user"],
        tipo_processo_id=tipo.id,
        especificacao="Processo para bloco de assinatura",
        interessados=[{"nome": "X"}],
    )


async def test_listar_e_detalhar_bloco(cenario, client):
    db = cenario["db"]
    tenant_id = cenario["tenant_id"]
    processo = await _autuar(cenario)

    doc = await documento.criar_documento_interno(
        db, tenant_id, cenario["user"],
        processo_id=processo.id, titulo="Despacho para bloco", conteudo_html="<p>a</p>",
    )
    bloco = await bloco_assinatura.criar_bloco(db, tenant_id, cenario["user"], nome="Bloco da tarde")
    await bloco_assinatura.adicionar_documento(
        db, tenant_id, cenario["user"], bloco_id=bloco.id, documento_id=doc.id
    )

    token = _token(cenario["user"], tenant_id)
    headers = {"Authorization": f"Bearer {token}"}

    res = await client.get("/api/govpro/v1/blocos-assinatura", headers=headers)
    assert res.status_code == 200
    blocos = res.json()
    assert any(b["id"] == str(bloco.id) and b["total_documentos"] == 1 for b in blocos)

    res = await client.get(f"/api/govpro/v1/blocos-assinatura/{bloco.id}", headers=headers)
    assert res.status_code == 200
    detalhe = res.json()
    assert detalhe["nome"] == "Bloco da tarde"
    assert len(detalhe["documentos"]) == 1
    assert detalhe["documentos"][0]["titulo"] == "Despacho para bloco"
    assert detalhe["documentos"][0]["processo_nup"] == processo.nup


async def test_bloco_de_outro_tenant_retorna_404(cenario, client, db_session):
    from app.models.organization import Organization
    from app.models.user import User

    db = cenario["db"]
    tenant_id = cenario["tenant_id"]
    bloco = await bloco_assinatura.criar_bloco(db, tenant_id, cenario["user"], nome="Bloco privado")

    outra_org = Organization(name="Outro Ente", slug="outro-ente-bloco", is_active=True)
    db_session.add(outra_org)
    await db_session.flush()
    outro_user = User(
        organization_id=outra_org.id, name="U", email="u-bloco@teste.local", is_active=True, password_hash=None
    )
    db_session.add(outro_user)
    await db_session.flush()
    role = (await db_session.execute(select(Role).where(Role.name == RoleName.SERVIDOR.value))).scalar_one()
    db_session.add(UserRole(user_id=outro_user.id, role_id=role.id))
    await db_session.commit()

    token_b = _token(outro_user, outra_org.id)
    res = await client.get(
        f"/api/govpro/v1/blocos-assinatura/{bloco.id}",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert res.status_code == 404
