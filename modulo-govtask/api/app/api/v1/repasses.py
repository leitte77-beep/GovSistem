import uuid
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user, require_roles
from app.core.database import get_db
from app.models.convenio import Convenio
from app.models.enums import StatusRepasse, TipoEvento
from app.models.repasse import Repasse
from app.models.user import User
from app.schemas.repasse import RepasseCreate, RepasseOut, RepasseReceber, RepasseUpdate
from app.services.auditoria import registrar_auditoria
from app.services.notifications import notificar_repasse_recebido
from app.services.timeline import registrar_evento

router = APIRouter(prefix="/convenios/{convenio_id}/repasses", tags=["repasses"])


async def _get_convenio(db, convenio_id, user):
    result = await db.execute(
        select(Convenio).where(
            Convenio.id == convenio_id,
            Convenio.organization_id == user.organization_id,
            Convenio.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


async def _get_repasse(db, convenio_id, repasse_id, user):
    result = await db.execute(
        select(Repasse)
        .join(Convenio, Convenio.id == Repasse.convenio_id)
        .where(
            Repasse.id == repasse_id,
            Convenio.id == convenio_id,
            Convenio.organization_id == user.organization_id,
            Repasse.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


@router.get("", response_model=list[RepasseOut])
async def listar_repasses(
    request: Request,
    convenio_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not await _get_convenio(db, convenio_id, user):
        raise HTTPException(status_code=404, detail="Processo não encontrado")
    result = await db.execute(
        select(Repasse)
        .where(Repasse.convenio_id == convenio_id, Repasse.deleted_at.is_(None))
        .order_by(Repasse.parcela)
    )
    return result.scalars().all()


@router.post("", response_model=RepasseOut, status_code=201)
async def criar_repasse(
    request: Request,
    convenio_id: uuid.UUID,
    body: RepasseCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ASSESSOR", "ADMIN")),
):
    if not await _get_convenio(db, convenio_id, user):
        raise HTTPException(status_code=404, detail="Processo não encontrado")

    repasse = Repasse(
        convenio_id=convenio_id,
        parcela=body.parcela,
        valor_previsto=body.valor_previsto,
        data_prevista=body.data_prevista,
        conta_destino=body.conta_destino,
        observacao=body.observacao,
        status=StatusRepasse.PREVISTO,
        registrado_por_id=user.id,
    )
    db.add(repasse)
    await db.flush()
    await registrar_evento(
        db,
        convenio_id=convenio_id,
        tipo_evento=TipoEvento.REPASSE_REGISTRADO,
        ator_id=user.id,
        descricao=f"Repasse previsto (parcela {body.parcela})",
        metadados={"parcela": body.parcela},
    )
    await registrar_auditoria(
        db,
        user_id=user.id,
        organization_id=user.organization_id,
        acao="repasse.criar",
        convenio_id=convenio_id,
        entidade="repasse",
        entidade_id=repasse.id,
        request=request,
    )
    await db.commit()
    await db.refresh(repasse)
    return repasse


@router.post("/{repasse_id}/receber", response_model=RepasseOut)
async def receber_repasse(
    request: Request,
    convenio_id: uuid.UUID,
    repasse_id: uuid.UUID,
    body: RepasseReceber,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ASSESSOR", "ADMIN")),
):
    repasse = await _get_repasse(db, convenio_id, repasse_id, user)
    if not repasse:
        raise HTTPException(status_code=404, detail="Repasse não encontrado")

    repasse.valor_recebido = body.valor_recebido
    repasse.data_recebida = body.data_recebida or datetime.now(timezone.utc)
    repasse.status = StatusRepasse.RECEBIDO

    await registrar_evento(
        db,
        convenio_id=convenio_id,
        tipo_evento=TipoEvento.REPASSE_REGISTRADO,
        ator_id=user.id,
        descricao=f"Repasse (parcela {repasse.parcela}) recebido",
        metadados={"parcela": repasse.parcela, "valor": str(body.valor_recebido)},
    )
    await registrar_auditoria(
        db,
        user_id=user.id,
        organization_id=user.organization_id,
        acao="repasse.receber",
        convenio_id=convenio_id,
        entidade="repasse",
        entidade_id=repasse.id,
        request=request,
    )

    convenio = await _get_convenio(db, convenio_id, user)
    if convenio and convenio.responsavel_id:
        await notificar_repasse_recebido(
            db,
            convenio_id=convenio_id,
            destinatario_id=convenio.responsavel_id,
            parcela=repasse.parcela,
            valor=str(body.valor_recebido),
        )

    await db.commit()
    await db.refresh(repasse)
    return repasse


@router.patch("/{repasse_id}", response_model=RepasseOut)
async def atualizar_repasse(
    request: Request,
    convenio_id: uuid.UUID,
    repasse_id: uuid.UUID,
    body: RepasseUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ASSESSOR", "ADMIN")),
):
    repasse = await _get_repasse(db, convenio_id, repasse_id, user)
    if not repasse:
        raise HTTPException(status_code=404, detail="Repasse não encontrado")

    if body.valor_previsto is not None:
        repasse.valor_previsto = body.valor_previsto
    if body.data_prevista is not None:
        repasse.data_prevista = body.data_prevista
    if body.conta_destino is not None:
        repasse.conta_destino = body.conta_destino
    if body.observacao is not None:
        repasse.observacao = body.observacao

    await db.commit()
    await db.refresh(repasse)
    return repasse


@router.delete("/{repasse_id}", status_code=204)
async def excluir_repasse(
    request: Request,
    convenio_id: uuid.UUID,
    repasse_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ASSESSOR", "ADMIN")),
):
    repasse = await _get_repasse(db, convenio_id, repasse_id, user)
    if not repasse:
        raise HTTPException(status_code=404, detail="Repasse não encontrado")
    repasse.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    return None
