"""Testes de multi-assinatura (quantidade mínima + sem duplicidade)."""

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.dominio import TipoDocumento, TipoProcesso
from app.models.enums import RoleName, SituacaoDocumento
from app.models.role import Role
from app.models.user import User
from app.models.user_role import UserRole
from app.services import assinatura, documento
from app.services.autuacao import autuar


async def _tipo_processo(db, tenant_id, codigo):
    return (
        await db.execute(
            select(TipoProcesso).where(TipoProcesso.tenant_id == tenant_id, TipoProcesso.codigo == codigo)
        )
    ).scalar_one()


async def _tipo_documento(db, tenant_id, codigo):
    return (
        await db.execute(
            select(TipoDocumento).where(TipoDocumento.tenant_id == tenant_id, TipoDocumento.codigo == codigo)
        )
    ).scalar_one()


async def _autuar(cenario):
    db = cenario["db"]
    tipo = await _tipo_processo(db, cenario["tenant_id"], "LICENCA_OBRA")
    return await autuar(
        db,
        cenario["tenant_id"],
        cenario["user"],
        tipo_processo_id=tipo.id,
        especificacao="Processo multi-assinatura",
        interessados=[{"nome": "X"}],
    )


async def _novo_usuario(db, tenant_id, email: str) -> User:
    user = User(organization_id=tenant_id, name=email.split("@")[0], email=email, is_active=True)
    db.add(user)
    await db.flush()
    role = (await db.execute(select(Role).where(Role.name == RoleName.SERVIDOR.value))).scalar_one()
    db.add(UserRole(user_id=user.id, role_id=role.id))
    await db.commit()
    return (
        await db.execute(
            select(User).where(User.id == user.id).options(selectinload(User.user_roles).selectinload(UserRole.role))
        )
    ).scalar_one()


async def test_multiassinatura_quantidade_minima(cenario):
    db = cenario["db"]
    tenant_id = cenario["tenant_id"]
    processo = await _autuar(cenario)
    tipo = await _tipo_documento(db, tenant_id, "PARECER")

    tipo.qtd_assinaturas_minima = 2
    tipo.perfis_autorizados = None
    await db.commit()

    doc = await documento.criar_documento_interno(
        db, tenant_id, cenario["user"],
        processo_id=processo.id,
        titulo="Parecer coletivo",
        conteudo_html="<p>a</p>",
        tipo_documento_id=tipo.id,
    )

    signatario_2 = await _novo_usuario(db, tenant_id, "segundo@teste.local")

    await assinatura.assinar_documento(db, tenant_id, cenario["user"], documento_id=doc.id)
    await db.refresh(doc)
    assert doc.situacao == SituacaoDocumento.EM_ASSINATURA.value

    await assinatura.assinar_documento(db, tenant_id, signatario_2, documento_id=doc.id)
    await db.refresh(doc)
    assert doc.situacao == SituacaoDocumento.ASSINADO.value
    assert doc.assinado_em is not None


async def test_multiassinatura_bloqueia_mesmo_signatario(cenario):
    db = cenario["db"]
    tenant_id = cenario["tenant_id"]
    processo = await _autuar(cenario)
    tipo = await _tipo_documento(db, tenant_id, "PARECER")

    tipo.qtd_assinaturas_minima = 2
    tipo.perfis_autorizados = None
    await db.commit()

    doc = await documento.criar_documento_interno(
        db, tenant_id, cenario["user"],
        processo_id=processo.id,
        titulo="Parecer duplo",
        conteudo_html="<p>a</p>",
        tipo_documento_id=tipo.id,
    )

    await assinatura.assinar_documento(db, tenant_id, cenario["user"], documento_id=doc.id)
    with pytest.raises(HTTPException) as exc:
        await assinatura.assinar_documento(db, tenant_id, cenario["user"], documento_id=doc.id)
    assert exc.value.status_code == 409


async def test_multiassinatura_excede_quantidade_minima(cenario):
    db = cenario["db"]
    tenant_id = cenario["tenant_id"]
    processo = await _autuar(cenario)
    tipo = await _tipo_documento(db, tenant_id, "PARECER")

    tipo.qtd_assinaturas_minima = 2
    tipo.perfis_autorizados = None
    await db.commit()

    doc = await documento.criar_documento_interno(
        db, tenant_id, cenario["user"],
        processo_id=processo.id,
        titulo="Parecer cheio",
        conteudo_html="<p>a</p>",
        tipo_documento_id=tipo.id,
    )

    signatario_2 = await _novo_usuario(db, tenant_id, "segundo@teste.local")
    signatario_3 = await _novo_usuario(db, tenant_id, "terceiro@teste.local")

    await assinatura.assinar_documento(db, tenant_id, cenario["user"], documento_id=doc.id)
    await assinatura.assinar_documento(db, tenant_id, signatario_2, documento_id=doc.id)

    with pytest.raises(HTTPException) as exc:
        await assinatura.assinar_documento(db, tenant_id, signatario_3, documento_id=doc.id)
    assert exc.value.status_code == 409
