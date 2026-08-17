from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import PAPEIS_LEITURA, get_tenant_id, require_roles
from app.core.database import get_db
from app.models.processo import Processo
from app.models.user import User
from app.schemas import ProcessoOut

router = APIRouter(tags=["busca"])

DbDep = Annotated[AsyncSession, Depends(get_db)]
TenantDep = Annotated[object, Depends(get_tenant_id)]


@router.get("/busca", response_model=list[ProcessoOut])
async def buscar(
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_LEITURA)),
    q: str = Query(min_length=3, max_length=200),
    limit: int = Query(default=50, ge=1, le=100),
):
    like = f"%{q}%"
    stmt = (
        select(Processo)
        .where(
            Processo.tenant_id == tenant_id,
            (Processo.nup.ilike(like))
            | (Processo.especificacao.ilike(like))
            | (Processo.numero_antigo.ilike(like)),
        )
        .order_by(Processo.created_at.desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    return list(result.scalars())
