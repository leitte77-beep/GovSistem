import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.database import get_db
from app.models.convenio import Convenio
from app.models.processo_favorito import ProcessoFavorito
from app.models.user import User

router = APIRouter(prefix="/processos", tags=["processos"])


@router.get("/favoritos")
async def listar_favoritos(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Convenio)
        .join(ProcessoFavorito, ProcessoFavorito.convenio_id == Convenio.id)
        .where(
            ProcessoFavorito.user_id == user.id,
            Convenio.deleted_at.is_(None),
        )
    )
    return [
        {"id": c.id, "titulo": c.titulo, "tipo": c.tipo.value, "status": c.status.value}
        for c in result.scalars().all()
    ]


@router.post("/{convenio_id}/favoritar", status_code=204)
async def favoritar(
    convenio_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Convenio).where(
            Convenio.id == convenio_id,
            Convenio.organization_id == user.organization_id,
            Convenio.deleted_at.is_(None),
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Processo não encontrado")

    exists = await db.execute(
        select(ProcessoFavorito).where(
            ProcessoFavorito.convenio_id == convenio_id,
            ProcessoFavorito.user_id == user.id,
        )
    )
    if not exists.scalar_one_or_none():
        db.add(ProcessoFavorito(convenio_id=convenio_id, user_id=user.id))
        await db.commit()
    return None


@router.delete("/{convenio_id}/favoritar", status_code=204)
async def desfavoritar(
    convenio_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ProcessoFavorito).where(
            ProcessoFavorito.convenio_id == convenio_id,
            ProcessoFavorito.user_id == user.id,
        )
    )
    favorito = result.scalar_one_or_none()
    if favorito:
        await db.delete(favorito)
        await db.commit()
    return None
