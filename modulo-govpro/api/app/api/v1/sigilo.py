"""Endpoints de sigilo: classificação, desclassificação e credenciais."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import (
    PAPEIS_SIGILO_ADMIN,
    get_client_info,
    get_tenant_id,
    require_roles,
)
from app.core.database import get_db
from app.models.credencial import CredencialAcesso
from app.models.user import User
from app.services import sigilo

router = APIRouter(tags=["sigilo"])

DbDep = Annotated[AsyncSession, Depends(get_db)]
TenantDep = Annotated[object, Depends(get_tenant_id)]


@router.get("/processos/{processo_id}/credenciais")
async def listar_credenciais(
    processo_id: uuid.UUID,
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_SIGILO_ADMIN)),
):
    result = await db.execute(
        select(CredencialAcesso, User.name, User.email)
        .join(User, User.id == CredencialAcesso.usuario_id)
        .where(
            CredencialAcesso.tenant_id == tenant_id,
            CredencialAcesso.processo_id == processo_id,
            CredencialAcesso.revogada_em.is_(None),
        )
        .order_by(CredencialAcesso.created_at.desc())
    )
    return [
        {
            "id": str(c.id),
            "usuario_id": str(c.usuario_id),
            "usuario_nome": nome,
            "usuario_email": email,
            "motivo": c.motivo,
            "concedida_em": c.created_at.isoformat(),
        }
        for c, nome, email in result.all()
    ]


class ClassificarInput(BaseModel):
    alvo_tipo: str  # processo | documento
    grau: str | None = None
    hipotese_legal_id: str | None = None
    prazo_anos: int | None = None
    justificativa: str | None = None


class DesclassificarInput(BaseModel):
    justificativa: str = "Desclassificação"


class ConcederCredencialInput(BaseModel):
    usuario_id: str
    motivo: str | None = None


@router.post("/{alvo_tipo}/{alvo_id}/classificar")
async def classificar(
    alvo_tipo: str,
    alvo_id: str,
    payload: ClassificarInput,
    request: Request,
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_SIGILO_ADMIN)),
):
    return await sigilo.classificar(
        db,
        tenant_id,
        user,
        alvo_tipo=alvo_tipo,
        alvo_id=alvo_id,
        grau=payload.grau,
        hipotese_legal_id=payload.hipotese_legal_id,
        prazo_anos=payload.prazo_anos,
        justificativa=payload.justificativa,
        client=get_client_info(request),
    )


@router.post("/{alvo_tipo}/{alvo_id}/desclassificar")
async def desclassificar(
    alvo_tipo: str,
    alvo_id: str,
    payload: DesclassificarInput,
    request: Request,
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_SIGILO_ADMIN)),
):
    return await sigilo.desclassificar(
        db,
        tenant_id,
        user,
        alvo_tipo=alvo_tipo,
        alvo_id=alvo_id,
        justificativa=payload.justificativa,
        client=get_client_info(request),
    )


@router.post("/processos/{processo_id}/credenciais", status_code=201)
async def conceder_credencial(
    processo_id: uuid.UUID,
    payload: ConcederCredencialInput,
    request: Request,
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_SIGILO_ADMIN)),
):
    credencial = await sigilo.conceder_credencial(
        db,
        tenant_id,
        user,
        processo_id=processo_id,
        usuario_id=payload.usuario_id,
        motivo=payload.motivo,
        client=get_client_info(request),
    )
    return {
        "id": str(credencial.id),
        "processo_id": str(credencial.processo_id),
        "usuario_id": str(credencial.usuario_id),
    }


@router.delete("/processos/{processo_id}/credenciais/{usuario_id}")
async def revogar_credencial(
    processo_id: uuid.UUID,
    usuario_id: uuid.UUID,
    request: Request,
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_SIGILO_ADMIN)),
    motivo: str | None = None,
):
    credencial = await sigilo.revogar_credencial(
        db,
        tenant_id,
        user,
        processo_id=processo_id,
        usuario_id=usuario_id,
        motivo=motivo,
        client=get_client_info(request),
    )
    return {
        "id": str(credencial.id),
        "revogada_em": credencial.revogada_em.isoformat() if credencial.revogada_em else None,
    }
