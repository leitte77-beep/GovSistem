"""Rotas da camada de IA (§92).

Todas exigem apenas `resource.view` e **não gravam nada**: devolvem uma
sugestão. Aplicá-la é editar a demanda pela rota normal, com confirmação
humana — é o que impede a IA de alterar informação oficial sozinha.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import get_user_permissions, require_permission
from app.core.config import settings
from app.core.database import get_db
from app.core.permissions import Perm
from app.models.anexo import Anexo
from app.models.demanda import Demanda
from app.models.user import User
from app.schemas.ia import IADocumentosSugeridos, IASugestao, IAStatus
from app.services import ia
from app.services.demandas import get_demanda_ou_404

router = APIRouter(prefix="/demandas/{demanda_id}/ia", tags=["IA da demanda"])


async def _contexto(db: AsyncSession, demanda_id: uuid.UUID, user: User) -> Demanda:
    """Autoriza e recarrega com as relações que o prompt lê.

    Sem o eager load, tocar em `demanda.tipo` dispararia lazy load fora do
    contexto async (MissingGreenlet).
    """
    await get_demanda_ou_404(db, demanda_id, user, get_user_permissions(user))
    return (
        await db.execute(
            select(Demanda)
            .where(Demanda.id == demanda_id)
            .options(
                selectinload(Demanda.tipo),
                selectinload(Demanda.status),
                selectinload(Demanda.setor_atual),
                selectinload(Demanda.responsavel_geral),
            )
        )
    ).scalar_one()


@router.get("/status", response_model=IAStatus)
async def status_ia(
    demanda_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    await _contexto(db, demanda_id, user)
    return IAStatus(
        disponivel=ia.configurada(),
        provedor=settings.AI_PROVIDER,
        modelo=settings.AI_MODEL,
    )


async def _chamar(funcao, *args):
    try:
        return await funcao(*args)
    except ia.IADesabilitada as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except ia.IAFalhou as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.post("/resumo", response_model=IASugestao)
async def sugerir_resumo(
    demanda_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    demanda = await _contexto(db, demanda_id, user)
    return IASugestao(sugestao=await _chamar(ia.sugerir_resumo, demanda))


@router.post("/proxima-acao", response_model=IASugestao)
async def sugerir_proxima_acao(
    demanda_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    demanda = await _contexto(db, demanda_id, user)
    return IASugestao(sugestao=await _chamar(ia.sugerir_proxima_acao, demanda))


@router.post("/documentos-faltantes", response_model=IADocumentosSugeridos)
async def sugerir_documentos_faltantes(
    demanda_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    demanda = await _contexto(db, demanda_id, user)
    nomes = (
        (
            await db.execute(
                select(Anexo.nome_arquivo).where(
                    Anexo.demanda_id == demanda.id, Anexo.deleted_at.is_(None)
                )
            )
        )
        .scalars()
        .all()
    )
    sugestoes = await _chamar(ia.sugerir_documentos_faltantes, demanda, list(nomes))
    return IADocumentosSugeridos(sugestoes=sugestoes)
