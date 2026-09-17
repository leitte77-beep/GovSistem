"""Busca global e autocomplete (§48, §115)."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_user_permissions, require_permission
from app.core.database import get_db
from app.core.permissions import Perm
from app.models.user import User
from app.services import busca as svc

router = APIRouter(prefix="/busca", tags=["Busca"])


@router.get("")
async def global_(
    q: str = Query(min_length=2, max_length=200),
    limite: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    return await svc.busca_global(db, user, get_user_permissions(user), q, limite)


@router.get("/sugestoes")
async def sugestoes(
    q: str = Query(min_length=2, max_length=200),
    limite: int = Query(8, ge=1, le=20),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    return await svc.sugerir(db, user, get_user_permissions(user), q, limite)
