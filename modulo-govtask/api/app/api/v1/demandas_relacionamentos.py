"""Hierarquia pai/filha e vínculos laterais entre demandas (§220–§222).

Todas as rotas são aninhadas na demanda: a autorização (tenant + sigilo)
resolve antes de tocar no vínculo, então não existe caminho por ID que alcance
demanda de outro município.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_user_permissions, require_permission
from app.core.database import get_db
from app.core.permissions import Perm
from app.models.demanda import Demanda
from app.models.enums import TipoEvento
from app.models.relacionamento_demanda import DemandaRelacionamento
from app.models.user import User
from app.schemas.gestao_avancada import (
    DemandaResumoOut,
    HierarquiaOut,
    RelacionamentoCreate,
    RelacionamentoOut,
    VincularPaiRequest,
)
from app.services import demandas as svc_demanda
from app.services import relacionamentos as svc
from app.services.timeline import registrar_evento

router = APIRouter(prefix="/demandas", tags=["Demandas · Relacionamentos"])


def _resumo(demanda: Demanda) -> DemandaResumoOut:
    return DemandaResumoOut.model_validate(demanda)


@router.get("/{demanda_id}/hierarquia", response_model=HierarquiaOut)
async def obter_hierarquia(
    demanda_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    demanda = await svc_demanda.get_demanda_ou_404(
        db, demanda_id, user, get_user_permissions(user)
    )
    pai = None
    if demanda.demanda_pai_id:
        pai = await svc._demanda_do_tenant(db, demanda.demanda_pai_id, user.organization_id)
    filhas = (
        (
            await db.execute(
                select(Demanda).where(
                    Demanda.demanda_pai_id == demanda.id,
                    Demanda.organization_id == user.organization_id,
                    Demanda.deleted_at.is_(None),
                )
            )
        )
        .scalars()
        .all()
    )
    vinculos = (
        (
            await db.execute(
                select(DemandaRelacionamento)
                .where(
                    DemandaRelacionamento.demanda_id == demanda.id,
                    DemandaRelacionamento.organization_id == user.organization_id,
                    DemandaRelacionamento.deleted_at.is_(None),
                )
            )
        )
        .scalars()
        .all()
    )
    agregado = await svc.progresso_agregado(db, demanda)
    return HierarquiaOut(
        pai=_resumo(pai) if pai else None,
        filhas=[_resumo(f) for f in filhas],
        relacionamentos=[
            RelacionamentoOut(
                id=v.id,
                tipo=v.tipo,
                descricao=v.descricao,
                relacionada=_resumo(v.relacionada),
                created_at=v.created_at,
            )
            for v in vinculos
            if v.relacionada is not None
        ],
        **agregado,
    )


@router.put("/{demanda_id}/pai", response_model=HierarquiaOut)
async def vincular_pai(
    demanda_id: uuid.UUID,
    payload: VincularPaiRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_EDIT)),
):
    demanda = await svc_demanda.get_demanda_ou_404(
        db, demanda_id, user, get_user_permissions(user)
    )
    pai = await svc.validar_vinculo_pai(
        db, demanda=demanda, pai_id=payload.demanda_pai_id, organization_id=user.organization_id
    )
    anterior = demanda.demanda_pai_id
    demanda.demanda_pai_id = pai.id
    await svc_demanda.marcar_movimentacao(demanda)
    await registrar_evento(
        db,
        tipo_evento=TipoEvento.DEMANDA_PAI_VINCULADA,
        ator_id=user.id,
        descricao=f"Demanda vinculada como filha de {pai.numero}",
        demanda_id=demanda.id,
        metadados={"pai_anterior": str(anterior) if anterior else None, "pai": str(pai.id)},
    )
    await db.commit()
    return await obter_hierarquia(demanda_id, db, user)


@router.delete("/{demanda_id}/pai", response_model=HierarquiaOut)
async def desvincular_pai(
    demanda_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_EDIT)),
):
    demanda = await svc_demanda.get_demanda_ou_404(
        db, demanda_id, user, get_user_permissions(user)
    )
    if demanda.demanda_pai_id is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Demanda não tem pai")
    anterior = demanda.demanda_pai_id
    demanda.demanda_pai_id = None
    await svc_demanda.marcar_movimentacao(demanda)
    await registrar_evento(
        db,
        tipo_evento=TipoEvento.DEMANDA_RELACIONAMENTO_REMOVIDO,
        ator_id=user.id,
        descricao="Vínculo de subordinação removido",
        demanda_id=demanda.id,
        metadados={"pai_anterior": str(anterior)},
    )
    await db.commit()
    return await obter_hierarquia(demanda_id, db, user)


@router.post(
    "/{demanda_id}/relacionamentos",
    response_model=RelacionamentoOut,
    status_code=status.HTTP_201_CREATED,
)
async def criar_relacionamento(
    demanda_id: uuid.UUID,
    payload: RelacionamentoCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_EDIT)),
):
    demanda = await svc_demanda.get_demanda_ou_404(
        db, demanda_id, user, get_user_permissions(user)
    )
    if payload.relacionada_id == demanda.id:
        raise HTTPException(status_code=422, detail="Uma demanda não se relaciona consigo mesma")
    outra = await svc._demanda_do_tenant(db, payload.relacionada_id, user.organization_id)
    if outra is None:
        raise HTTPException(status_code=404, detail="Demanda relacionada não encontrada")
    existente = (
        await db.execute(
            select(DemandaRelacionamento).where(
                DemandaRelacionamento.demanda_id == demanda.id,
                DemandaRelacionamento.relacionada_id == outra.id,
                DemandaRelacionamento.tipo == payload.tipo.value,
                DemandaRelacionamento.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if existente is not None:
        raise HTTPException(status_code=409, detail="Este vínculo já existe")
    vinculo = DemandaRelacionamento(
        organization_id=user.organization_id,
        demanda_id=demanda.id,
        relacionada_id=outra.id,
        tipo=payload.tipo,
        descricao=payload.descricao,
        criado_por_id=user.id,
    )
    db.add(vinculo)
    await db.flush()
    await svc_demanda.marcar_movimentacao(demanda)
    await registrar_evento(
        db,
        tipo_evento=TipoEvento.DEMANDA_RELACIONADA,
        ator_id=user.id,
        descricao=f"Demanda {demanda.numero} relacionada a {outra.numero} ({payload.tipo.value})",
        demanda_id=demanda.id,
        metadados={"relacionada_id": str(outra.id), "tipo": payload.tipo.value},
    )
    await db.commit()
    await db.refresh(vinculo)
    return RelacionamentoOut(
        id=vinculo.id,
        tipo=vinculo.tipo,
        descricao=vinculo.descricao,
        relacionada=_resumo(outra),
        created_at=vinculo.created_at,
    )


@router.delete("/{demanda_id}/relacionamentos/{vinculo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remover_relacionamento(
    demanda_id: uuid.UUID,
    vinculo_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_EDIT)),
):
    demanda = await svc_demanda.get_demanda_ou_404(
        db, demanda_id, user, get_user_permissions(user)
    )
    vinculo = (
        await db.execute(
            select(DemandaRelacionamento).where(
                DemandaRelacionamento.id == vinculo_id,
                DemandaRelacionamento.demanda_id == demanda.id,
                DemandaRelacionamento.organization_id == user.organization_id,
                DemandaRelacionamento.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if vinculo is None:
        raise HTTPException(status_code=404, detail="Vínculo não encontrado")
    from datetime import datetime, timezone

    vinculo.deleted_at = datetime.now(timezone.utc)
    await svc_demanda.marcar_movimentacao(demanda)
    await registrar_evento(
        db,
        tipo_evento=TipoEvento.DEMANDA_RELACIONAMENTO_REMOVIDO,
        ator_id=user.id,
        descricao="Vínculo entre demandas removido",
        demanda_id=demanda.id,
        metadados={"relacionada_id": str(vinculo.relacionada_id)},
    )
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── Progresso agregado (§222) ───────────────────────────────────────────────

@router.get("/{demanda_id}/progresso-agregado")
async def progresso_agregado(
    demanda_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    demanda = await svc_demanda.get_demanda_ou_404(
        db, demanda_id, user, get_user_permissions(user)
    )
    return await svc.progresso_agregado(db, demanda)
