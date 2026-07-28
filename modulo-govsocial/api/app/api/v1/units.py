import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import (
    get_client_info,
    get_current_user,
    get_tenant_id,
    require_roles,
)
from app.core.database import get_db
from app.models.enums import AuditAction, RoleName
from app.models.unit import Unit
from app.models.user import User
from app.schemas import UnitCreate, UnitOut, UnitUpdate
from app.services.audit import record_audit

router = APIRouter(prefix="/units", tags=["units"])

_MANAGE = require_roles(
    RoleName.GESTOR_MUNICIPAL.value,
    RoleName.COORDENADOR_UNIDADE.value,
    RoleName.ADMIN.value,
)
_DELETE = require_roles(
    RoleName.GESTOR_MUNICIPAL.value,
    RoleName.ADMIN.value,
)


async def _get_owned_unit(
    db: AsyncSession, tenant_id: uuid.UUID, unit_id: uuid.UUID
) -> Unit:
    unit = (
        await db.execute(
            select(Unit).where(
                Unit.id == unit_id,
                Unit.tenant_id == tenant_id,
                Unit.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if not unit:
        # 404 (não 403) para não vazar existência entre tenants.
        raise HTTPException(status_code=404, detail="Unidade não encontrada")
    return unit


@router.get("", response_model=list[UnitOut])
async def listar_unidades(
    tipo: str | None = Query(None),
    search: str | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(get_current_user),
):
    query = select(Unit).where(
        Unit.tenant_id == tenant_id, Unit.deleted_at.is_(None)
    )
    if tipo:
        query = query.where(Unit.tipo == tipo)
    if search:
        query = query.where(Unit.nome.ilike(f"%{search}%"))
    query = query.order_by(Unit.nome).offset(skip).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("", response_model=UnitOut, status_code=201)
async def criar_unidade(
    body: UnitCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    unit = Unit(tenant_id=tenant_id, **body.model_dump())
    db.add(unit)
    await db.flush()
    await record_audit(
        db,
        tenant_id=tenant_id,
        action=AuditAction.CREATE,
        entity="unit",
        entity_id=unit.id,
        actor=user,
        client_info=get_client_info(request),
        diff_summary={"nome": unit.nome, "tipo": unit.tipo},
    )
    await db.commit()
    await db.refresh(unit)
    return unit


@router.get("/{unit_id}", response_model=UnitOut)
async def obter_unidade(
    unit_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(get_current_user),
):
    return await _get_owned_unit(db, tenant_id, unit_id)


@router.patch("/{unit_id}", response_model=UnitOut)
async def atualizar_unidade(
    unit_id: uuid.UUID,
    body: UnitUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    unit = await _get_owned_unit(db, tenant_id, unit_id)
    changes = body.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(unit, field, value)
    await record_audit(
        db,
        tenant_id=tenant_id,
        action=AuditAction.UPDATE,
        entity="unit",
        entity_id=unit.id,
        actor=user,
        client_info=get_client_info(request),
        diff_summary={"campos": list(changes.keys())},
    )
    await db.commit()
    await db.refresh(unit)
    return unit


@router.delete("/{unit_id}", status_code=204)
async def excluir_unidade(
    unit_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_DELETE),
):
    unit = await _get_owned_unit(db, tenant_id, unit_id)
    unit.deleted_at = datetime.now(timezone.utc)
    await record_audit(
        db,
        tenant_id=tenant_id,
        action=AuditAction.DELETE,
        entity="unit",
        entity_id=unit.id,
        actor=user,
        client_info=get_client_info(request),
    )
    await db.commit()
    return None
