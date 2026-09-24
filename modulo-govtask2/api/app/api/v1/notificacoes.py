"""Notificações in-app do Assessor: o sino da topbar."""

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.database import get_db
from app.models.auth_models import User
from app.schemas.pedido import NotificacoesResposta
from app.services import notificacoes as servico

router = APIRouter(prefix="/notificacoes", tags=["notificacoes"])


@router.get("", response_model=NotificacoesResposta)
async def listar(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    itens = await servico.listar(db, user)
    return NotificacoesResposta(
        nao_lidas=await servico.contar_nao_lidas(db, user),
        itens=itens,
    )


@router.post("/marcar-lidas", response_model=NotificacoesResposta)
async def marcar_lidas(
    notificacao_id: uuid.UUID | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await servico.marcar_lidas(db, user, notificacao_id=notificacao_id)
    return NotificacoesResposta(
        nao_lidas=await servico.contar_nao_lidas(db, user),
        itens=await servico.listar(db, user),
    )
