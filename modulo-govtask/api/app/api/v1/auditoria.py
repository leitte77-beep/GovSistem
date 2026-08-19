import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user, require_permission
from app.core.database import get_db
from app.core.permissions import Perm
from app.models.auditoria import Auditoria
from app.models.user import User
from app.schemas.auditoria import AuditoriaOut

router = APIRouter(prefix="/auditoria", tags=["auditoria"])


@router.get("", response_model=list[AuditoriaOut])
async def listar_auditoria(
    convenio_id: uuid.UUID | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.AUDIT_VIEW)),
):
    query = select(Auditoria).where(Auditoria.organization_id == user.organization_id)
    if convenio_id:
        query = query.where(Auditoria.convenio_id == convenio_id)
    query = query.order_by(Auditoria.ocorrido_em.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()
