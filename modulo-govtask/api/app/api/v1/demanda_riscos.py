"""Registro gerencial de riscos (§211)."""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_user_permissions, require_permission
from app.core.database import get_db
from app.core.permissions import Perm
from app.models.enums import StatusRisco, TipoEvento
from app.models.risco import DemandaRisco
from app.models.user import User
from app.schemas.gestao_avancada import RiscoCreate, RiscoOut, RiscoUpdate
from app.services import demandas as svc_demanda
from app.services.timeline import registrar_evento

router = APIRouter(prefix="/demandas", tags=["Demandas · Riscos"])

ENCERRADOS = (StatusRisco.MITIGADO, StatusRisco.MATERIALIZADO, StatusRisco.ENCERRADO)


async def _risco_ou_404(
    db: AsyncSession, demanda_id: uuid.UUID, risco_id: uuid.UUID, organization_id: uuid.UUID
) -> DemandaRisco:
    risco = (
        await db.execute(
            select(DemandaRisco).where(
                DemandaRisco.id == risco_id,
                DemandaRisco.demanda_id == demanda_id,
                DemandaRisco.organization_id == organization_id,
                DemandaRisco.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if risco is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Risco não encontrado")
    return risco


@router.get("/{demanda_id}/riscos", response_model=list[RiscoOut])
async def listar_riscos(
    demanda_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    await svc_demanda.get_demanda_ou_404(db, demanda_id, user, get_user_permissions(user))
    riscos = (
        (
            await db.execute(
                select(DemandaRisco)
                .where(
                    DemandaRisco.demanda_id == demanda_id,
                    DemandaRisco.organization_id == user.organization_id,
                    DemandaRisco.deleted_at.is_(None),
                )
                .order_by(DemandaRisco.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    return [RiscoOut.model_validate(r) for r in riscos]


@router.post(
    "/{demanda_id}/riscos", response_model=RiscoOut, status_code=status.HTTP_201_CREATED
)
async def criar_risco(
    demanda_id: uuid.UUID,
    payload: RiscoCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_EDIT)),
):
    demanda = await svc_demanda.get_demanda_ou_404(
        db, demanda_id, user, get_user_permissions(user)
    )
    risco = DemandaRisco(
        organization_id=user.organization_id,
        demanda_id=demanda.id,
        criado_por_id=user.id,
        **payload.model_dump(),
    )
    db.add(risco)
    await db.flush()
    await svc_demanda.marcar_movimentacao(demanda)
    await registrar_evento(
        db,
        tipo_evento=TipoEvento.RISCO_REGISTRADO,
        ator_id=user.id,
        descricao=f"Risco registrado ({risco.nivel.value}): {risco.descricao[:120]}",
        demanda_id=demanda.id,
        metadados={"risco_id": str(risco.id), "score": risco.score},
    )
    await db.commit()
    await db.refresh(risco)
    return RiscoOut.model_validate(risco)


@router.patch("/{demanda_id}/riscos/{risco_id}", response_model=RiscoOut)
async def atualizar_risco(
    demanda_id: uuid.UUID,
    risco_id: uuid.UUID,
    payload: RiscoUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_EDIT)),
):
    demanda = await svc_demanda.get_demanda_ou_404(
        db, demanda_id, user, get_user_permissions(user)
    )
    risco = await _risco_ou_404(db, demanda.id, risco_id, user.organization_id)
    alteracoes = payload.model_dump(exclude_unset=True)
    for campo, valor in alteracoes.items():
        setattr(risco, campo, valor)
    if risco.status in ENCERRADOS and risco.resolvido_em is None:
        risco.resolvido_em = datetime.now(timezone.utc)
    if risco.status not in ENCERRADOS:
        risco.resolvido_em = None
    await svc_demanda.marcar_movimentacao(demanda)
    await registrar_evento(
        db,
        tipo_evento=TipoEvento.RISCO_ATUALIZADO,
        ator_id=user.id,
        descricao=f"Risco atualizado: {risco.descricao[:120]}",
        demanda_id=demanda.id,
        metadados={"risco_id": str(risco.id), "status": risco.status.value, "score": risco.score},
    )
    await db.commit()
    await db.refresh(risco)
    return RiscoOut.model_validate(risco)


@router.delete("/{demanda_id}/riscos/{risco_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remover_risco(
    demanda_id: uuid.UUID,
    risco_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_EDIT)),
):
    demanda = await svc_demanda.get_demanda_ou_404(
        db, demanda_id, user, get_user_permissions(user)
    )
    risco = await _risco_ou_404(db, demanda.id, risco_id, user.organization_id)
    risco.deleted_at = datetime.now(timezone.utc)
    await registrar_evento(
        db,
        tipo_evento=TipoEvento.RISCO_REMOVIDO,
        ator_id=user.id,
        descricao="Risco removido do registro",
        demanda_id=demanda.id,
    )
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
