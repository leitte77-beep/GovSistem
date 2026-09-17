"""Administração das regras trigger → condição → ação."""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import require_permission
from app.core.database import get_db
from app.core.permissions import Perm
from app.models.automacao import Automacao
from app.models.user import User
from app.schemas.automacao import AutomacaoAtualizar, AutomacaoCriar, AutomacaoOut

router = APIRouter(prefix="/automacoes", tags=["Automações"])

async def _regra(db, regra_id, user):
    regra = await db.scalar(
        select(Automacao).where(
            Automacao.id == regra_id,
            Automacao.organization_id == user.organization_id,
            Automacao.deleted_at.is_(None),
        )
    )
    if not regra:
        raise HTTPException(404, "Automação não encontrada")
    return regra

@router.get("", response_model=list[AutomacaoOut])
async def listar(db: AsyncSession = Depends(get_db), user: User = Depends(require_permission(Perm.ADMIN_CONFIG))):
    return (await db.execute(select(Automacao).where(Automacao.organization_id == user.organization_id, Automacao.deleted_at.is_(None)).order_by(Automacao.nome))).scalars().all()

@router.post("", response_model=AutomacaoOut, status_code=status.HTTP_201_CREATED)
async def criar(payload: AutomacaoCriar, db: AsyncSession = Depends(get_db), user: User = Depends(require_permission(Perm.ADMIN_CONFIG))):
    regra = Automacao(organization_id=user.organization_id, criado_por_id=user.id, **payload.model_dump())
    db.add(regra)
    await db.commit()
    await db.refresh(regra)
    return regra

@router.patch("/{regra_id}", response_model=AutomacaoOut)
async def atualizar(regra_id: uuid.UUID, payload: AutomacaoAtualizar, db: AsyncSession = Depends(get_db), user: User = Depends(require_permission(Perm.ADMIN_CONFIG))):
    regra = await _regra(db, regra_id, user)
    for campo, valor in payload.model_dump(exclude_unset=True).items():
        setattr(regra, campo, valor)
    await db.commit()
    await db.refresh(regra)
    return regra

@router.delete("/{regra_id}", status_code=status.HTTP_204_NO_CONTENT)
async def excluir(regra_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(require_permission(Perm.ADMIN_CONFIG))):
    regra = await _regra(db, regra_id, user)
    regra.deleted_at = datetime.now(timezone.utc)
    await db.commit()
