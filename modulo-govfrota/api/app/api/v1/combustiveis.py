import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user, require_permission
from app.core.database import get_db
from app.core.permissions import Perm
from app.models.auth_models import User
from app.models.combustivel import Combustivel
from app.schemas.schemas import CombustivelCreate, CombustivelResponse
from app.services.auditoria import registrar_auditoria

router = APIRouter(prefix="/combustiveis", tags=["combustíveis"])


@router.get("", response_model=list[CombustivelResponse])
async def listar(
    ativo: bool | None = None,
    user: User = Depends(require_permission(Perm.VEHICLE_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Combustivel).where(
        Combustivel.organization_id == user.organization_id,
        Combustivel.deleted_at.is_(None),
    )
    if ativo is not None:
        stmt = stmt.where(Combustivel.ativo == ativo)
    stmt = stmt.order_by(Combustivel.nome)
    return (await db.execute(stmt)).scalars().all()


@router.post("", response_model=CombustivelResponse, status_code=201)
async def criar(
    body: CombustivelCreate,
    user: User = Depends(require_permission(Perm.FUEL_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    existente = await db.execute(
        select(Combustivel.id).where(
            Combustivel.organization_id == user.organization_id,
            sa_lower(Combustivel.nome) == body.nome.strip().lower(),
            Combustivel.deleted_at.is_(None),
        )
    )
    if existente.scalar_one_or_none():
        raise HTTPException(status_code=422, detail="Já existe um combustível com este nome.")
    combustivel = Combustivel(**body.model_dump(), organization_id=user.organization_id)
    db.add(combustivel)
    await db.flush()
    await registrar_auditoria(
        db,
        organization_id=user.organization_id,
        acao="combustivel.criar",
        entidade="combustivel",
        entidade_id=combustivel.id,
        usuario_id=user.id,
        dados_novos={"nome": body.nome},
    )
    await db.commit()
    await db.refresh(combustivel)
    return combustivel


@router.patch("/{combustivel_id}", response_model=CombustivelResponse)
async def atualizar(
    combustivel_id: uuid.UUID,
    body: CombustivelCreate,
    user: User = Depends(require_permission(Perm.FUEL_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Combustivel).where(
            Combustivel.id == combustivel_id,
            Combustivel.organization_id == user.organization_id,
            Combustivel.deleted_at.is_(None),
        )
    )
    combustivel = result.scalar_one_or_none()
    if combustivel is None:
        raise HTTPException(status_code=404, detail="Combustível não encontrado.")
    for campo, valor in body.model_dump(exclude_unset=True).items():
        setattr(combustivel, campo, valor)
    await registrar_auditoria(
        db,
        organization_id=user.organization_id,
        acao="combustivel.atualizar",
        entidade="combustivel",
        entidade_id=combustivel.id,
        usuario_id=user.id,
    )
    await db.commit()
    await db.refresh(combustivel)
    return combustivel


def sa_lower(col):  # pragma: no cover
    from sqlalchemy import func as sa_func

    return sa_func.lower(col)
