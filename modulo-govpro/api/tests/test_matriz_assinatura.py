"""Testes da Matriz de Assinatura (Fase 6) — perfis autorizados e bloco."""

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.dominio import TipoDocumento, TipoProcesso
from app.models.enums import RoleName, SituacaoDocumento
from app.models.role import Role
from app.models.user import User
from app.models.user_role import UserRole
from app.services import assinatura, bloco_assinatura, documento
from app.services.autuacao import autuar


async def _tipo_processo(db, tenant_id, codigo):
    result = await db.execute(
        select(TipoProcesso).where(
            TipoProcesso.tenant_id == tenant_id, TipoProcesso.codigo == codigo
        )
    )
    return result.scalar_one()


async def _tipo_documento(db, tenant_id, codigo):
    result = await db.execute(
        select(TipoDocumento).where(
            TipoDocumento.tenant_id == tenant_id, TipoDocumento.codigo == codigo
        )
    )
    return result.scalar_one()


async def _autuar(cenario):
    db = cenario["db"]
    tipo = await _tipo_processo(db, cenario["tenant_id"], "LICENCA_OBRA")
    return await autuar(
        db,
        cenario["tenant_id"],
        cenario["user"],
        tipo_processo_id=tipo.id,
        especificacao="Processo matriz de assinatura",
        interessados=[{"nome": "X"}],
    )


async def _conceder_papel(db, user, papel: str) -> None:
    role = (
        await db.execute(select(Role).where(Role.name == papel))
    ).scalar_one()
    db.add(UserRole(user_id=user.id, role_id=role.id))
    await db.commit()


async def _reload_user(db, user) -> User:
    return (
        await db.execute(
            select(User)
            .where(User.id == user.id)
            .options(selectinload(User.user_roles).selectinload(UserRole.role))
        )
    ).scalar_one()


async def test_perfil_sem_autorizacao_nao_assinna(cenario):
    db = cenario["db"]
    tenant_id = cenario["tenant_id"]
    processo = await _autuar(cenario)
    tipo_despacho = await _tipo_documento(db, tenant_id, "DESPACHO")

    # Configura a matriz: DESPACHO restrito a CHEFE_UNIDADE/AUTORIDADE_SIGNATARIA/ADMIN.
    tipo_despacho.perfis_autorizados = [
        RoleName.CHEFE_UNIDADE.value,
        RoleName.AUTORIDADE_SIGNATARIA.value,
        RoleName.ADMIN.value,
    ]
    await db.commit()

    doc = await documento.criar_documento_interno(
        db, tenant_id, cenario["user"],
        processo_id=processo.id,
        titulo="Despacho teste",
        conteudo_html="<p>a</p>",
        tipo_documento_id=tipo_despacho.id,
    )

    servidor = await _reload_user(db, cenario["user"])
    with pytest.raises(HTTPException) as exc:
        await assinatura.assinar_documento(
            db, tenant_id, servidor, documento_id=doc.id, papel_cargo="Servidor"
        )
    assert exc.value.status_code == 403


async def test_perfil_autorizado_assinna(cenario):
    db = cenario["db"]
    tenant_id = cenario["tenant_id"]
    processo = await _autuar(cenario)
    tipo_despacho = await _tipo_documento(db, tenant_id, "DESPACHO")

    # Matriz restritiva, e o usuário recebe o perfil autorizado.
    tipo_despacho.perfis_autorizados = [
        RoleName.CHEFE_UNIDADE.value,
        RoleName.AUTORIDADE_SIGNATARIA.value,
        RoleName.ADMIN.value,
    ]
    await _conceder_papel(db, cenario["user"], RoleName.CHEFE_UNIDADE.value)
    await db.commit()

    chefe = await _reload_user(db, cenario["user"])

    doc = await documento.criar_documento_interno(
        db, tenant_id, cenario["user"],
        processo_id=processo.id,
        titulo="Despacho assinável",
        conteudo_html="<p>a</p>",
        tipo_documento_id=tipo_despacho.id,
    )

    assin = await assinatura.assinar_documento(
        db, tenant_id, chefe, documento_id=doc.id, papel_cargo="Chefe"
    )
    assert assin.signatario_nome == cenario["user"].name

    await db.refresh(doc)
    assert doc.situacao == SituacaoDocumento.ASSINADO.value


async def test_tipo_sem_bloco_rejeita_adicao(cenario):
    db = cenario["db"]
    tenant_id = cenario["tenant_id"]
    processo = await _autuar(cenario)
    tipo_parecer = await _tipo_documento(db, tenant_id, "PARECER")

    # Força a matriz: este ato não aceita bloco.
    tipo_parecer.permite_bloco = False
    await db.commit()

    doc = await documento.criar_documento_interno(
        db, tenant_id, cenario["user"],
        processo_id=processo.id,
        titulo="Parecer sem bloco",
        conteudo_html="<p>a</p>",
        tipo_documento_id=tipo_parecer.id,
    )
    bloco = await bloco_assinatura.criar_bloco(db, tenant_id, cenario["user"], nome="Bloco")

    with pytest.raises(HTTPException) as exc:
        await bloco_assinatura.adicionar_documento(
            db, tenant_id, cenario["user"], bloco_id=bloco.id, documento_id=doc.id
        )
    assert exc.value.status_code == 422
