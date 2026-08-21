import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user, require_permission
from app.core.permissions import Perm
from app.core.database import get_db
from app.models.convenio import Convenio
from app.models.enums import TipoEvento
from app.models.entrega_objeto import EntregaObjeto
from app.models.user import User
from app.schemas.entrega_objeto import EntregaCreate, EntregaOut, EntregaUpdate
from app.services.auditoria import registrar_auditoria
from app.services.timeline import registrar_evento

router = APIRouter(prefix="/convenios/{convenio_id}/entregas", tags=["entregas"])


async def _get_convenio(db, convenio_id, user):
    result = await db.execute(
        select(Convenio).where(
            Convenio.id == convenio_id,
            Convenio.organization_id == user.organization_id,
            Convenio.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


async def _get_entrega(db, convenio_id, entrega_id, user):
    result = await db.execute(
        select(EntregaObjeto)
        .join(Convenio, Convenio.id == EntregaObjeto.convenio_id)
        .where(
            EntregaObjeto.id == entrega_id,
            Convenio.id == convenio_id,
            Convenio.organization_id == user.organization_id,
            EntregaObjeto.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


@router.get("", response_model=list[EntregaOut])
async def listar_entregas(
    request: Request,
    convenio_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not await _get_convenio(db, convenio_id, user):
        raise HTTPException(status_code=404, detail="Processo não encontrado")
    result = await db.execute(
        select(EntregaObjeto)
        .where(EntregaObjeto.convenio_id == convenio_id, EntregaObjeto.deleted_at.is_(None))
    )
    return result.scalars().all()


@router.post("", response_model=EntregaOut, status_code=201)
async def criar_entrega(
    request: Request,
    convenio_id: uuid.UUID,
    body: EntregaCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.ACCOUNTABILITY_MANAGE)),
):
    if not await _get_convenio(db, convenio_id, user):
        raise HTTPException(status_code=404, detail="Processo não encontrado")

    entrega = EntregaObjeto(
        convenio_id=convenio_id,
        tipo=body.tipo,
        fornecedor=body.fornecedor,
        data_entrega=body.data_entrega,
        nota_fiscal=body.nota_fiscal,
        quantidade=body.quantidade,
        identificacao=body.identificacao,
        patrimonio=body.patrimonio,
        placa=body.placa,
        chassi=body.chassi,
        modelo=body.modelo,
        local_entrega=body.local_entrega,
        responsavel_recebimento_id=body.responsavel_recebimento_id,
        termo_recebimento=body.termo_recebimento,
        observacao=body.observacao,
    )
    db.add(entrega)
    await db.flush()
    await registrar_evento(
        db,
        convenio_id=convenio_id,
        tipo_evento=TipoEvento.ENTREGA_REGISTRADA,
        ator_id=user.id,
        descricao=f"Entrega registrada: {body.identificacao or body.fornecedor or 'objeto'}",
    )
    await registrar_auditoria(
        db,
        user_id=user.id,
        organization_id=user.organization_id,
        acao="entrega.criar",
        convenio_id=convenio_id,
        entidade="entrega_objeto",
        entidade_id=entrega.id,
        request=request,
    )
    await db.commit()
    await db.refresh(entrega)
    return entrega


@router.patch("/{entrega_id}", response_model=EntregaOut)
async def atualizar_entrega(
    request: Request,
    convenio_id: uuid.UUID,
    entrega_id: uuid.UUID,
    body: EntregaUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.ACCOUNTABILITY_MANAGE)),
):
    entrega = await _get_entrega(db, convenio_id, entrega_id, user)
    if not entrega:
        raise HTTPException(status_code=404, detail="Entrega não encontrada")

    if body.status is not None:
        entrega.status = body.status
    if body.termo_recebimento is not None:
        entrega.termo_recebimento = body.termo_recebimento
    if body.observacao is not None:
        entrega.observacao = body.observacao
    if body.data_entrega is not None:
        entrega.data_entrega = body.data_entrega
    if body.nota_fiscal is not None:
        entrega.nota_fiscal = body.nota_fiscal

    await db.commit()
    await db.refresh(entrega)
    return entrega


@router.delete("/{entrega_id}", status_code=204)
async def excluir_entrega(
    request: Request,
    convenio_id: uuid.UUID,
    entrega_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.ACCOUNTABILITY_MANAGE)),
):
    entrega = await _get_entrega(db, convenio_id, entrega_id, user)
    if not entrega:
        raise HTTPException(status_code=404, detail="Entrega não encontrada")
    entrega.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    return None
