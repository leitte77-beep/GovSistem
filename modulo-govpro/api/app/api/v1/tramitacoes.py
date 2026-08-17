import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import (
    PAPEIS_ATUANTES,
    PAPEIS_LEITURA,
    get_client_info,
    get_tenant_id,
    require_roles,
)
from app.core.database import get_db
from app.models.tramitacao import Tramitacao
from app.models.user import User
from app.schemas import DevolucaoCreate, TramitacaoCreate, TramitacaoOut
from app.services import tramitacao as tramitacao_service

router = APIRouter(tags=["tramitacoes"])

DbDep = Annotated[AsyncSession, Depends(get_db)]
TenantDep = Annotated[object, Depends(get_tenant_id)]


@router.get("/processos/{processo_id}/tramitacoes", response_model=list[TramitacaoOut])
async def listar_tramitacoes(
    processo_id,
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_LEITURA)),
):
    result = await db.execute(
        select(Tramitacao)
        .where(
            Tramitacao.processo_id == uuid.UUID(processo_id),
            Tramitacao.tenant_id == tenant_id,
        )
        .order_by(Tramitacao.created_at)
    )
    return list(result.scalars())


@router.post(
    "/processos/{processo_id}/tramitacoes", response_model=list[TramitacaoOut], status_code=201
)
async def tramitar(
    processo_id,
    payload: TramitacaoCreate,
    request: Request,
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_ATUANTES)),
):
    return await tramitacao_service.tramitar(
        db,
        tenant_id,
        user,
        processo_id=processo_id,
        unidade_origem_id=payload.unidade_origem_id,
        destinos=[d.model_dump() for d in payload.destinos],
        client=get_client_info(request),
    )


@router.post("/tramitacoes/{tramitacao_id}/receber", response_model=TramitacaoOut)
async def receber(
    tramitacao_id,
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_ATUANTES)),
):
    return await tramitacao_service.receber_tramitacao(
        db, tenant_id, user, tramitacao_id=tramitacao_id
    )


@router.post("/processos/{processo_id}/devolver", response_model=TramitacaoOut, status_code=201)
async def devolver(
    processo_id,
    payload: DevolucaoCreate,
    request: Request,
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_ATUANTES)),
):
    return await tramitacao_service.devolver(
        db,
        tenant_id,
        user,
        processo_id=processo_id,
        unidade_origem_id=payload.unidade_origem_id,
        unidade_destino_id=payload.unidade_destino_id,
        motivo=payload.motivo,
        client=get_client_info(request),
    )


@router.post("/processos/{processo_id}/concluir-unidade")
async def concluir_unidade(
    processo_id,
    unidade_id: str,
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_ATUANTES)),
):
    pu = await tramitacao_service.concluir_na_unidade(
        db, tenant_id, user, processo_id=processo_id, unidade_id=unidade_id
    )
    return {
        "processo_id": str(pu.processo_id),
        "unidade_id": str(pu.unidade_id),
        "estado": pu.estado,
    }
