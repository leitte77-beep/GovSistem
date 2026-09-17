"""Marcos do projeto (§213)."""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_user_permissions, require_permission
from app.core.database import get_db
from app.core.permissions import Perm
from app.models.enums import StatusMarco, TipoEvento
from app.models.marco import DemandaMarco
from app.models.user import User
from app.schemas.gestao_avancada import (
    ConcluirMarcoRequest,
    MarcoCreate,
    MarcoOut,
    MarcoUpdate,
)
from app.services import demandas as svc_demanda
from app.services.timeline import registrar_evento

router = APIRouter(prefix="/demandas", tags=["Demandas · Marcos"])


async def _marco_ou_404(
    db: AsyncSession, demanda_id: uuid.UUID, marco_id: uuid.UUID, organization_id: uuid.UUID
) -> DemandaMarco:
    marco = (
        await db.execute(
            select(DemandaMarco).where(
                DemandaMarco.id == marco_id,
                DemandaMarco.demanda_id == demanda_id,
                DemandaMarco.organization_id == organization_id,
                DemandaMarco.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if marco is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Marco não encontrado")
    return marco


@router.get("/{demanda_id}/marcos", response_model=list[MarcoOut])
async def listar_marcos(
    demanda_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    await svc_demanda.get_demanda_ou_404(db, demanda_id, user, get_user_permissions(user))
    marcos = (
        (
            await db.execute(
                select(DemandaMarco)
                .where(
                    DemandaMarco.demanda_id == demanda_id,
                    DemandaMarco.organization_id == user.organization_id,
                    DemandaMarco.deleted_at.is_(None),
                )
                .order_by(DemandaMarco.ordem, DemandaMarco.created_at)
            )
        )
        .scalars()
        .all()
    )
    return [MarcoOut.model_validate(m) for m in marcos]


@router.post(
    "/{demanda_id}/marcos", response_model=MarcoOut, status_code=status.HTTP_201_CREATED
)
async def criar_marco(
    demanda_id: uuid.UUID,
    payload: MarcoCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_EDIT)),
):
    demanda = await svc_demanda.get_demanda_ou_404(
        db, demanda_id, user, get_user_permissions(user)
    )
    marco = DemandaMarco(
        organization_id=user.organization_id,
        demanda_id=demanda.id,
        criado_por_id=user.id,
        **payload.model_dump(),
    )
    db.add(marco)
    await db.flush()
    await svc_demanda.marcar_movimentacao(demanda)
    await registrar_evento(
        db,
        tipo_evento=TipoEvento.MARCO_CRIADO,
        ator_id=user.id,
        descricao=f"Marco registrado: {marco.titulo}",
        demanda_id=demanda.id,
        metadados={"marco_id": str(marco.id), "data_prevista": str(marco.data_prevista)},
    )
    await db.commit()
    await db.refresh(marco)
    return MarcoOut.model_validate(marco)


@router.patch("/{demanda_id}/marcos/{marco_id}", response_model=MarcoOut)
async def atualizar_marco(
    demanda_id: uuid.UUID,
    marco_id: uuid.UUID,
    payload: MarcoUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_EDIT)),
):
    demanda = await svc_demanda.get_demanda_ou_404(
        db, demanda_id, user, get_user_permissions(user)
    )
    marco = await _marco_ou_404(db, demanda.id, marco_id, user.organization_id)
    alteracoes = payload.model_dump(exclude_unset=True)
    for campo, valor in alteracoes.items():
        setattr(marco, campo, valor)
    await svc_demanda.marcar_movimentacao(demanda)
    await db.commit()
    await db.refresh(marco)
    return MarcoOut.model_validate(marco)


@router.post("/{demanda_id}/marcos/{marco_id}/concluir", response_model=MarcoOut)
async def concluir_marco(
    demanda_id: uuid.UUID,
    marco_id: uuid.UUID,
    payload: ConcluirMarcoRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_EDIT)),
):
    demanda = await svc_demanda.get_demanda_ou_404(
        db, demanda_id, user, get_user_permissions(user)
    )
    marco = await _marco_ou_404(db, demanda.id, marco_id, user.organization_id)
    if marco.status == StatusMarco.CONCLUIDO:
        raise HTTPException(status_code=409, detail="Marco já está concluído")
    marco.status = StatusMarco.CONCLUIDO
    marco.data_realizada = payload.data_realizada or datetime.now(timezone.utc)
    await svc_demanda.marcar_movimentacao(demanda)
    await registrar_evento(
        db,
        tipo_evento=TipoEvento.MARCO_CONCLUIDO,
        ator_id=user.id,
        descricao=f"Marco atingido: {marco.titulo}"
        + (f" — {payload.observacao}" if payload.observacao else ""),
        demanda_id=demanda.id,
        metadados={"marco_id": str(marco.id)},
    )
    await db.commit()
    await db.refresh(marco)
    return MarcoOut.model_validate(marco)


@router.delete("/{demanda_id}/marcos/{marco_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remover_marco(
    demanda_id: uuid.UUID,
    marco_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_EDIT)),
):
    demanda = await svc_demanda.get_demanda_ou_404(
        db, demanda_id, user, get_user_permissions(user)
    )
    marco = await _marco_ou_404(db, demanda.id, marco_id, user.organization_id)
    marco.deleted_at = datetime.now(timezone.utc)
    await registrar_evento(
        db,
        tipo_evento=TipoEvento.MARCO_REMOVIDO,
        ator_id=user.id,
        descricao=f"Marco removido: {marco.titulo}",
        demanda_id=demanda.id,
    )
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
