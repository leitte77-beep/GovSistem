"""Gestão do cidadão pelo órgão: aprovação de cadastro, intimações e acesso externo."""

import uuid
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import (
    PAPEIS_ATUANTES,
    get_client_info,
    get_tenant_id,
    require_roles,
)
from app.core.database import get_db
from app.models.cidadao import AcessoExterno, Intimacao, Manifestacao, UsuarioExterno
from app.models.user import User
from app.services import acesso_externo, cidadao, intimacao

router = APIRouter(tags=["gestao-cidadao"])

DbDep = Annotated[AsyncSession, Depends(get_db)]
TenantDep = Annotated[object, Depends(get_tenant_id)]


class IntimacaoInput(BaseModel):
    destinatario_nome: str
    texto: str
    prazo_dias: int
    usuario_externo_id: Optional[uuid.UUID] = None
    destinatario_documento: Optional[str] = None


class AcessoExternoInput(BaseModel):
    usuario_externo_id: Optional[uuid.UUID] = None
    email_externo: Optional[str] = None
    escopo: Optional[dict] = None
    expira_em: Optional[str] = None


@router.get("/cidadaos/pendentes")
async def listar_pendentes(
    db: DbDep, tenant_id: TenantDep, user: User = Depends(require_roles(*PAPEIS_ATUANTES))
):
    resultado = await db.execute(
        select(UsuarioExterno).where(
            UsuarioExterno.tenant_id == tenant_id, UsuarioExterno.aprovado.is_(False)
        )
    )
    cidadaos = resultado.scalars().all()
    return [
        {"id": str(c.id), "nome": c.nome, "email": c.email, "cpf_cnpj": c.cpf_cnpj}
        for c in cidadaos
    ]


@router.post("/cidadaos/{cidadao_id}/aprovar")
async def aprovar_cidadao(
    cidadao_id: uuid.UUID,
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_ATUANTES)),
):
    aprovado = await cidadao.aprovar(db, tenant_id, cidadao_id)
    return {"id": str(aprovado.id), "aprovado": aprovado.aprovado}


@router.get("/processos/{processo_id}/intimacoes")
async def listar_intimacoes(
    processo_id: uuid.UUID,
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_ATUANTES)),
):
    result = await db.execute(
        select(Intimacao)
        .where(Intimacao.tenant_id == tenant_id, Intimacao.processo_id == processo_id)
        .order_by(Intimacao.created_at.desc())
    )
    return [
        {
            "id": str(i.id),
            "destinatario_nome": i.destinatario_nome,
            "texto": i.texto,
            "prazo_dias": i.prazo_dias,
            "status": i.status,
            "disponibilizada_em": (
                i.disponibilizada_em.isoformat() if i.disponibilizada_em else None
            ),
            "ciencia_em": i.ciencia_em.isoformat() if i.ciencia_em else None,
        }
        for i in result.scalars()
    ]


@router.post("/processos/{processo_id}/intimacoes", status_code=201)
async def criar_intimacao(
    processo_id: uuid.UUID,
    payload: IntimacaoInput,
    request: Request,
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_ATUANTES)),
):
    i = await intimacao.criar_intimacao(
        db,
        tenant_id,
        user,
        processo_id=processo_id,
        destinatario_nome=payload.destinatario_nome,
        texto=payload.texto,
        prazo_dias=payload.prazo_dias,
        usuario_externo_id=payload.usuario_externo_id,
        destinatario_documento=payload.destinatario_documento,
        client=get_client_info(request),
    )
    return {"id": str(i.id), "status": i.status}


@router.get("/processos/{processo_id}/acessos-externos")
async def listar_acessos_externos(
    processo_id: uuid.UUID,
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_ATUANTES)),
):
    result = await db.execute(
        select(AcessoExterno)
        .where(
            AcessoExterno.tenant_id == tenant_id,
            AcessoExterno.processo_id == processo_id,
            AcessoExterno.revogado_em.is_(None),
        )
        .order_by(AcessoExterno.created_at.desc())
    )
    return [
        {
            "id": str(a.id),
            "usuario_externo_id": str(a.usuario_externo_id) if a.usuario_externo_id else None,
            "email_externo": a.email_externo,
            "expira_em": a.expira_em.isoformat() if a.expira_em else None,
            "created_at": a.created_at.isoformat(),
        }
        for a in result.scalars()
    ]


@router.post("/processos/{processo_id}/acesso-externo", status_code=201)
async def conceder_acesso(
    processo_id: uuid.UUID,
    payload: AcessoExternoInput,
    request: Request,
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_ATUANTES)),
):
    from datetime import datetime

    expira_em = datetime.fromisoformat(payload.expira_em) if payload.expira_em else None
    acesso = await acesso_externo.conceder(
        db,
        tenant_id,
        user,
        processo_id=processo_id,
        usuario_externo_id=payload.usuario_externo_id,
        email_externo=payload.email_externo,
        escopo=payload.escopo,
        expira_em=expira_em,
        client=get_client_info(request),
    )
    return {"id": str(acesso.id), "processo_id": str(acesso.processo_id)}


@router.delete("/acessos-externos/{acesso_id}")
async def revogar_acesso(
    acesso_id: uuid.UUID,
    request: Request,
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_ATUANTES)),
):
    acesso = await acesso_externo.revogar(
        db, tenant_id, user, acesso_id=acesso_id, client=get_client_info(request)
    )
    return {
        "id": str(acesso.id),
        "revogado_em": acesso.revogado_em.isoformat() if acesso.revogado_em else None,
    }


@router.get("/manifestacoes")
async def listar_manifestacoes(
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_ATUANTES)),
):
    resultado = await db.execute(
        select(Manifestacao)
        .where(Manifestacao.tenant_id == tenant_id)
        .order_by(Manifestacao.created_at.desc())
    )
    manifestacoes = resultado.scalars().all()
    return [
        {
            "id": str(m.id),
            "tipo": m.tipo,
            "texto": m.texto,
            "anonima": m.anonima,
            "status": m.status,
        }
        for m in manifestacoes
    ]
