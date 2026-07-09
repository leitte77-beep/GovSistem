import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_tenant_id, require_roles
from app.core.database import get_db
from app.models.audit_trail import AuditTrail
from app.models.enums import RoleName
from app.models.user import User
from app.schemas import AuditOut

router = APIRouter(prefix="/audit", tags=["audit"])

_READ_AUDIT = require_roles(
    RoleName.GESTOR_MUNICIPAL.value,
    RoleName.VIGILANCIA.value,
    RoleName.COORDENADOR_UNIDADE.value,
    RoleName.ADMIN.value,
)


@router.get("", response_model=list[AuditOut])
async def consultar_trilha(
    entity: str | None = Query(None),
    entity_id: str | None = Query(None),
    actor_user_id: uuid.UUID | None = Query(None),
    access_type: str | None = Query(None),
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ_AUDIT),
):
    query = select(AuditTrail).where(AuditTrail.tenant_id == tenant_id)
    if entity:
        query = query.where(AuditTrail.entity == entity)
    if entity_id:
        query = query.where(AuditTrail.entity_id == entity_id)
    if actor_user_id:
        query = query.where(AuditTrail.actor_user_id == actor_user_id)
    if access_type:
        query = query.where(AuditTrail.access_type == access_type)
    if date_from:
        query = query.where(AuditTrail.occurred_at >= date_from)
    if date_to:
        query = query.where(AuditTrail.occurred_at <= date_to)
    query = query.order_by(AuditTrail.occurred_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()
