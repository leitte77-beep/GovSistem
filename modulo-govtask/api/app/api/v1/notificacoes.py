import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.database import get_db
from app.models.enums import TipoNotificacao
from app.models.notificacao import Notificacao
from app.models.user import User
from app.schemas.notificacao import NotificacaoOut

router = APIRouter(tags=["notificacoes"])


@router.get("/notificacoes", response_model=list[NotificacaoOut])
async def listar_notificacoes(
    nao_lidas: bool = Query(False),
    tipo: TipoNotificacao | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = (
        select(Notificacao)
        .where(Notificacao.destinatario_id == user.id)
    )
    if nao_lidas:
        query = query.where(Notificacao.lida == False)
    if tipo:
        query = query.where(Notificacao.tipo == tipo)

    query = query.offset(skip).limit(limit).order_by(Notificacao.created_at.desc())
    result = await db.execute(query)
    return result.scalars().all()


@router.post("/notificacoes/{notificacao_id}/marcar-lida")
async def marcar_lida(
    notificacao_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Notificacao).where(
            Notificacao.id == notificacao_id,
            Notificacao.destinatario_id == user.id,
        )
    )
    notif = result.scalar_one_or_none()
    if not notif:
        raise HTTPException(status_code=404, detail="Notificação não encontrada")

    notif.lida = True
    notif.lida_em = datetime.now(timezone.utc)
    await db.commit()
    return {"ok": True}


@router.post("/notificacoes/marcar-todas-lidas")
async def marcar_todas_lidas(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await db.execute(
        update(Notificacao)
        .where(
            Notificacao.destinatario_id == user.id,
            Notificacao.lida == False,
        )
        .values(lida=True, lida_em=datetime.now(timezone.utc))
    )
    await db.commit()
    return {"ok": True}
