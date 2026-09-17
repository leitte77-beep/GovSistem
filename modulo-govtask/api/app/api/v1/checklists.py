"""Checklists configuráveis da Demanda (§32, §67, §145).

O checklist é o "o que ainda falta" verificável. Itens obrigatórios pendentes
aparecem na checagem de conclusão da demanda, de modo que ninguém encerre um
processo com certidão faltando só porque a tela permitiu clicar em Concluir.
"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import get_user_permissions, require_permission
from app.core.database import get_db
from app.core.permissions import Perm
from app.models.anexo import Anexo
from app.models.checklist import Checklist, ChecklistItem
from app.models.enums import TipoEvento
from app.models.etapa import Etapa
from app.models.user import User
from app.services.demandas import get_demanda_ou_404, marcar_movimentacao
from app.services.timeline import registrar_evento

router = APIRouter(tags=["Checklists"])


class ItemIn(BaseModel):
    descricao: str = Field(min_length=2, max_length=300)
    obrigatorio: bool = True
    exige_documento: bool = False
    ordem: int | None = None


class ChecklistIn(BaseModel):
    titulo: str = Field(min_length=2, max_length=200)
    descricao: str | None = None
    obrigatorio: bool = False
    etapa_id: uuid.UUID | None = None
    itens: list[ItemIn] = Field(default_factory=list, max_length=100)


class ConcluirItemIn(BaseModel):
    observacao: str | None = None
    documento_id: uuid.UUID | None = None


class ItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    descricao: str
    ordem: int
    obrigatorio: bool
    exige_documento: bool
    documento_id: uuid.UUID | None
    observacao: str | None
    concluido_em: datetime | None
    concluido_por_id: uuid.UUID | None


class ChecklistOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    demanda_id: uuid.UUID
    etapa_id: uuid.UUID | None
    titulo: str
    descricao: str | None
    obrigatorio: bool
    total: int
    concluidos: int
    itens: list[ItemOut] = []


async def _get_checklist(
    db: AsyncSession, demanda_id: uuid.UUID, checklist_id: uuid.UUID, user: User
) -> tuple[Checklist, object]:
    demanda = await get_demanda_ou_404(db, demanda_id, user, get_user_permissions(user))
    checklist = (
        await db.execute(
            select(Checklist)
            .where(
                Checklist.id == checklist_id,
                Checklist.demanda_id == demanda.id,
                Checklist.deleted_at.is_(None),
            )
            .options(selectinload(Checklist.itens))
        )
    ).scalar_one_or_none()
    if checklist is None:
        raise HTTPException(404, "Checklist não encontrado")
    return checklist, demanda


@router.get("/demandas/{demanda_id}/checklists", response_model=list[ChecklistOut])
async def listar(
    demanda_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    demanda = await get_demanda_ou_404(db, demanda_id, user, get_user_permissions(user))
    return (
        (
            await db.execute(
                select(Checklist)
                .where(
                    Checklist.demanda_id == demanda.id,
                    Checklist.deleted_at.is_(None),
                )
                .options(selectinload(Checklist.itens))
                .order_by(Checklist.created_at)
            )
        )
        .scalars()
        .all()
    )


@router.post(
    "/demandas/{demanda_id}/checklists", response_model=ChecklistOut, status_code=201
)
async def criar(
    demanda_id: uuid.UUID,
    payload: ChecklistIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_EDIT)),
):
    demanda = await get_demanda_ou_404(db, demanda_id, user, get_user_permissions(user))
    if demanda.encerrada:
        raise HTTPException(409, "Demanda encerrada não recebe novos checklists")

    if payload.etapa_id is not None:
        pertence = (
            await db.execute(
                select(Etapa.id).where(
                    Etapa.id == payload.etapa_id, Etapa.demanda_id == demanda.id
                )
            )
        ).scalar_one_or_none()
        if pertence is None:
            raise HTTPException(404, "Etapa não encontrada nesta demanda")

    checklist = Checklist(
        organization_id=user.organization_id,
        demanda_id=demanda.id,
        etapa_id=payload.etapa_id,
        titulo=payload.titulo,
        descricao=payload.descricao,
        obrigatorio=payload.obrigatorio,
        criado_por_id=user.id,
    )
    db.add(checklist)
    await db.flush()
    for posicao, item in enumerate(payload.itens):
        db.add(
            ChecklistItem(
                checklist_id=checklist.id,
                descricao=item.descricao,
                obrigatorio=item.obrigatorio,
                exige_documento=item.exige_documento,
                ordem=item.ordem if item.ordem is not None else posicao,
            )
        )
    await marcar_movimentacao(demanda)
    await registrar_evento(
        db,
        TipoEvento.CHECKLIST_CRIADO,
        user.id,
        f"Checklist '{payload.titulo}' criado com {len(payload.itens)} item(ns)",
        demanda_id=demanda.id,
        metadados={"checklist_id": str(checklist.id)},
    )
    await db.commit()
    checklist, _ = await _get_checklist(db, demanda_id, checklist.id, user)
    return checklist


@router.post(
    "/demandas/{demanda_id}/checklists/{checklist_id}/itens",
    response_model=ChecklistOut,
    status_code=201,
)
async def adicionar_item(
    demanda_id: uuid.UUID,
    checklist_id: uuid.UUID,
    payload: ItemIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_EDIT)),
):
    checklist, _ = await _get_checklist(db, demanda_id, checklist_id, user)
    proxima = max((i.ordem for i in checklist.itens), default=-1) + 1
    db.add(
        ChecklistItem(
            checklist_id=checklist.id,
            descricao=payload.descricao,
            obrigatorio=payload.obrigatorio,
            exige_documento=payload.exige_documento,
            ordem=payload.ordem if payload.ordem is not None else proxima,
        )
    )
    await db.commit()
    checklist, _ = await _get_checklist(db, demanda_id, checklist_id, user)
    return checklist


@router.post(
    "/demandas/{demanda_id}/checklists/{checklist_id}/itens/{item_id}/concluir",
    response_model=ChecklistOut,
)
async def concluir_item(
    demanda_id: uuid.UUID,
    checklist_id: uuid.UUID,
    item_id: uuid.UUID,
    payload: ConcluirItemIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_EDIT)),
):
    checklist, demanda = await _get_checklist(db, demanda_id, checklist_id, user)
    item = next(
        (i for i in checklist.itens if i.id == item_id and i.deleted_at is None), None
    )
    if item is None:
        raise HTTPException(404, "Item não encontrado")
    if item.concluido_em is not None:
        raise HTTPException(409, "Item já concluído")

    if item.exige_documento:
        if payload.documento_id is None:
            raise HTTPException(422, "Este item só fecha com documento anexado")
        pertence = (
            await db.execute(
                select(Anexo.id).where(
                    Anexo.id == payload.documento_id,
                    Anexo.demanda_id == demanda.id,
                    Anexo.deleted_at.is_(None),
                )
            )
        ).scalar_one_or_none()
        if pertence is None:
            raise HTTPException(404, "Documento não encontrado nesta demanda")

    item.concluido_em = datetime.now(timezone.utc)
    item.concluido_por_id = user.id
    item.observacao = payload.observacao
    item.documento_id = payload.documento_id
    await marcar_movimentacao(demanda)
    await registrar_evento(
        db,
        TipoEvento.CHECKLIST_ITEM_CONCLUIDO,
        user.id,
        f"Checklist '{checklist.titulo}': '{item.descricao}' concluído",
        demanda_id=demanda.id,
        metadados={"checklist_id": str(checklist.id), "item_id": str(item.id)},
    )
    await db.commit()
    checklist, _ = await _get_checklist(db, demanda_id, checklist_id, user)
    return checklist


@router.post(
    "/demandas/{demanda_id}/checklists/{checklist_id}/itens/{item_id}/reabrir",
    response_model=ChecklistOut,
)
async def reabrir_item(
    demanda_id: uuid.UUID,
    checklist_id: uuid.UUID,
    item_id: uuid.UUID,
    motivo: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_EDIT)),
):
    """Reabrir exige motivo: desmarcar item é retirar uma afirmação do registro."""
    checklist, demanda = await _get_checklist(db, demanda_id, checklist_id, user)
    if len(motivo.strip()) < 5:
        raise HTTPException(422, "Informe o motivo da reabertura")
    item = next((i for i in checklist.itens if i.id == item_id), None)
    if item is None:
        raise HTTPException(404, "Item não encontrado")
    item.concluido_em = None
    item.concluido_por_id = None
    await registrar_evento(
        db,
        TipoEvento.CHECKLIST_ITEM_REABERTO,
        user.id,
        f"Checklist '{checklist.titulo}': '{item.descricao}' reaberto — {motivo}",
        demanda_id=demanda.id,
        metadados={"item_id": str(item.id), "motivo": motivo},
    )
    await db.commit()
    checklist, _ = await _get_checklist(db, demanda_id, checklist_id, user)
    return checklist


@router.delete(
    "/demandas/{demanda_id}/checklists/{checklist_id}/itens/{item_id}", status_code=204
)
async def remover_item(
    demanda_id: uuid.UUID,
    checklist_id: uuid.UUID,
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_EDIT)),
):
    checklist, _ = await _get_checklist(db, demanda_id, checklist_id, user)
    item = next((i for i in checklist.itens if i.id == item_id), None)
    if item is None:
        raise HTTPException(404, "Item não encontrado")
    item.deleted_at = datetime.now(timezone.utc)
    await db.commit()


@router.delete("/demandas/{demanda_id}/checklists/{checklist_id}", status_code=204)
async def remover(
    demanda_id: uuid.UUID,
    checklist_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_EDIT)),
):
    checklist, _ = await _get_checklist(db, demanda_id, checklist_id, user)
    checklist.deleted_at = datetime.now(timezone.utc)
    await db.commit()
