import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import get_current_user, require_permission
from app.core.permissions import Perm
from app.core.database import get_db
from app.models.convenio import Convenio
from app.models.enums import StatusPrestacao, TipoEvento
from app.models.prestacao_contas import PrestacaoContas, PrestacaoItem
from app.models.user import User
from app.schemas.prestacao_contas import (
    PrestacaoCreate,
    PrestacaoDecidir,
    PrestacaoEnviar,
    PrestacaoItemCreate,
    PrestacaoItemOut,
    PrestacaoItemToggle,
    PrestacaoOut,
)
from app.services.auditoria import registrar_auditoria
from app.services.notifications import notificar_prestacao_enviada
from app.services.timeline import registrar_evento

router = APIRouter(prefix="/convenios/{convenio_id}/prestacoes", tags=["prestacoes"])


async def _get_convenio(db, convenio_id, user):
    result = await db.execute(
        select(Convenio).where(
            Convenio.id == convenio_id,
            Convenio.organization_id == user.organization_id,
            Convenio.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


async def _get_prestacao(db, convenio_id, prestacao_id, user):
    result = await db.execute(
        select(PrestacaoContas)
        .join(Convenio, Convenio.id == PrestacaoContas.convenio_id)
        .where(
            PrestacaoContas.id == prestacao_id,
            Convenio.id == convenio_id,
            Convenio.organization_id == user.organization_id,
            PrestacaoContas.deleted_at.is_(None),
        )
        .options(selectinload(PrestacaoContas.itens))
    )
    return result.scalar_one_or_none()


@router.get("", response_model=list[PrestacaoOut])
async def listar_prestacoes(
    request: Request,
    convenio_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not await _get_convenio(db, convenio_id, user):
        raise HTTPException(status_code=404, detail="Processo não encontrado")
    result = await db.execute(
        select(PrestacaoContas)
        .where(PrestacaoContas.convenio_id == convenio_id, PrestacaoContas.deleted_at.is_(None))
        .options(selectinload(PrestacaoContas.itens))
    )
    return result.scalars().all()


@router.post("", response_model=PrestacaoOut, status_code=201)
async def criar_prestacao(
    request: Request,
    convenio_id: uuid.UUID,
    body: PrestacaoCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.ACCOUNTABILITY_MANAGE)),
):
    if not await _get_convenio(db, convenio_id, user):
        raise HTTPException(status_code=404, detail="Processo não encontrado")

    prestacao = PrestacaoContas(
        convenio_id=convenio_id,
        titulo=body.titulo,
        responsavel_id=body.responsavel_id or user.id,
        status=StatusPrestacao.EM_PREPARACAO,
    )
    db.add(prestacao)
    await db.flush()
    await registrar_evento(
        db,
        convenio_id=convenio_id,
        tipo_evento=TipoEvento.PRESTACAO_CRIADA,
        ator_id=user.id,
        descricao=f"Prestação de contas '{body.titulo or 'criada'}' iniciada",
    )
    await registrar_auditoria(
        db,
        user_id=user.id,
        organization_id=user.organization_id,
        acao="prestacao.criar",
        convenio_id=convenio_id,
        entidade="prestacao_contas",
        entidade_id=prestacao.id,
        request=request,
    )
    await db.commit()
    return await _get_prestacao(db, convenio_id, prestacao.id, user)


@router.post("/{prestacao_id}/itens", response_model=PrestacaoItemOut, status_code=201)
async def adicionar_item(
    request: Request,
    convenio_id: uuid.UUID,
    prestacao_id: uuid.UUID,
    body: PrestacaoItemCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.ACCOUNTABILITY_MANAGE)),
):
    prestacao = await _get_prestacao(db, convenio_id, prestacao_id, user)
    if not prestacao:
        raise HTTPException(status_code=404, detail="Prestação não encontrada")

    item = PrestacaoItem(prestacao_id=prestacao_id, descricao=body.descricao, conferido=False)
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


@router.patch("/{prestacao_id}/itens/{item_id}", response_model=PrestacaoItemOut)
async def alternar_item(
    request: Request,
    convenio_id: uuid.UUID,
    prestacao_id: uuid.UUID,
    item_id: uuid.UUID,
    body: PrestacaoItemToggle,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.ACCOUNTABILITY_MANAGE)),
):
    result = await db.execute(
        select(PrestacaoItem)
        .join(PrestacaoContas, PrestacaoContas.id == PrestacaoItem.prestacao_id)
        .join(Convenio, Convenio.id == PrestacaoContas.convenio_id)
        .where(
            PrestacaoItem.id == item_id,
            PrestacaoContas.id == prestacao_id,
            Convenio.id == convenio_id,
            Convenio.organization_id == user.organization_id,
            PrestacaoItem.deleted_at.is_(None),
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item não encontrado")

    if body.conferido is not None:
        item.conferido = body.conferido
        item.conferido_por_id = user.id
        item.data_conferencia = datetime.now(timezone.utc)
    # vincular_anexo permite desvincular enviando anexo_id nulo explicitamente
    if body.vincular_anexo or body.anexo_id is not None:
        item.anexo_id = body.anexo_id
    await db.commit()
    await db.refresh(item)
    return item


@router.delete("/{prestacao_id}/itens/{item_id}", status_code=204)
async def excluir_item(
    request: Request,
    convenio_id: uuid.UUID,
    prestacao_id: uuid.UUID,
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.ACCOUNTABILITY_MANAGE)),
):
    result = await db.execute(
        select(PrestacaoItem)
        .join(PrestacaoContas, PrestacaoContas.id == PrestacaoItem.prestacao_id)
        .join(Convenio, Convenio.id == PrestacaoContas.convenio_id)
        .where(
            PrestacaoItem.id == item_id,
            PrestacaoContas.id == prestacao_id,
            Convenio.id == convenio_id,
            Convenio.organization_id == user.organization_id,
            PrestacaoItem.deleted_at.is_(None),
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item não encontrado")
    item.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    return None


@router.post("/{prestacao_id}/enviar", response_model=PrestacaoOut)
async def enviar_prestacao(
    request: Request,
    convenio_id: uuid.UUID,
    prestacao_id: uuid.UUID,
    body: PrestacaoEnviar,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.ACCOUNTABILITY_MANAGE)),
):
    prestacao = await _get_prestacao(db, convenio_id, prestacao_id, user)
    if not prestacao:
        raise HTTPException(status_code=404, detail="Prestação não encontrada")

    prestacao.status = StatusPrestacao.ENVIADA
    prestacao.data_envio = body.data_envio or datetime.now(timezone.utc)
    prestacao.sistema_envio = body.sistema_envio
    prestacao.protocolo = body.protocolo
    prestacao.observacao = body.observacao

    await registrar_evento(
        db,
        convenio_id=convenio_id,
        tipo_evento=TipoEvento.PRESTACAO_ENVIADA,
        ator_id=user.id,
        descricao=f"Prestação de contas enviada (protocolo {body.protocolo or '-'})",
        metadados={"protocolo": body.protocolo},
    )
    await registrar_auditoria(
        db,
        user_id=user.id,
        organization_id=user.organization_id,
        acao="prestacao.enviar",
        convenio_id=convenio_id,
        entidade="prestacao_contas",
        entidade_id=prestacao.id,
        request=request,
    )
    convenio = await _get_convenio(db, convenio_id, user)
    if convenio and convenio.responsavel_id:
        await notificar_prestacao_enviada(
            db, convenio_id=convenio_id, destinatario_id=convenio.responsavel_id,
            titulo=prestacao.titulo or "",
        )

    await db.commit()
    return await _get_prestacao(db, convenio_id, prestacao_id, user)


@router.post("/{prestacao_id}/decidir", response_model=PrestacaoOut)
async def decidir_prestacao(
    request: Request,
    convenio_id: uuid.UUID,
    prestacao_id: uuid.UUID,
    body: PrestacaoDecidir,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.ACCOUNTABILITY_MANAGE)),
):
    prestacao = await _get_prestacao(db, convenio_id, prestacao_id, user)
    if not prestacao:
        raise HTTPException(status_code=404, detail="Prestação não encontrada")

    prestacao.status.assert_transition(body.status)
    prestacao.status = body.status
    prestacao.parecer = body.parecer or prestacao.parecer
    if body.status in (StatusPrestacao.APROVADA, StatusPrestacao.APROVADA_COM_OBSERVACAO):
        prestacao.data_aprovacao = datetime.now(timezone.utc)
        await registrar_evento(
            db,
            convenio_id=convenio_id,
            tipo_evento=TipoEvento.PRESTACAO_APROVADA,
            ator_id=user.id,
            descricao=f"Prestação de contas {body.status.value.lower().replace('_', ' ')}",
        )
    await registrar_auditoria(
        db,
        user_id=user.id,
        organization_id=user.organization_id,
        acao="prestacao.decidir",
        convenio_id=convenio_id,
        entidade="prestacao_contas",
        entidade_id=prestacao.id,
        request=request,
    )
    await db.commit()
    return await _get_prestacao(db, convenio_id, prestacao_id, user)


@router.delete("/{prestacao_id}", status_code=204)
async def excluir_prestacao(
    request: Request,
    convenio_id: uuid.UUID,
    prestacao_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.ACCOUNTABILITY_MANAGE)),
):
    prestacao = await _get_prestacao(db, convenio_id, prestacao_id, user)
    if not prestacao:
        raise HTTPException(status_code=404, detail="Prestação não encontrada")
    prestacao.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    return None
