"""Endpoints internos de integração com os módulos (chave interna).

Chamados pelos módulos (GovDoc, ChatGov etc.) para solicitar sincronização
de identidade e permissões — sempre protegidos por ``X-Internal-Key``.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import require_internal_key
from app.core.database import get_db
from app.models.module import Module
from app.models.organization import Organization
from app.models.user import User
from app.api.v1.users import _sync_user_to_modules

router = APIRouter(prefix="/internal", tags=["Integração interna"])


class SyncModuleUsersRequest(BaseModel):
    module_slug: str
    organization_id: uuid.UUID


@router.post("/sync-module-users", status_code=200)
async def sync_module_users(
    payload: SyncModuleUsersRequest,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_key),
):
    """Reenvia todos os usuários ativos de um órgão para um módulo.

    Usado pelo botão "Sincronizar agora" dos módulos: garante que a
    identidade e os papéis cheguem mesmo sem novo login na plataforma.
    """
    module = await db.scalar(select(Module).where(Module.slug == payload.module_slug))
    if module is None or not module.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Module not found"
        )

    org = await db.get(Organization, payload.organization_id)
    if org is None or org.deleted_at is not None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found"
        )

    rows = (
        await db.scalars(
            select(User).where(
                User.organization_id == org.id,
                User.deleted_at.is_(None),
                User.is_active.is_(True),
            )
        )
    ).all()

    sincronizados = 0
    erros: list[str] = []
    for user in rows:
        try:
            await _sync_user_to_modules(user, db)
            sincronizados += 1
        except Exception as exc:  # pragma: no cover - rede/erro inesperado
            erros.append(f"{user.email}: {exc}")

    return {
        "module_slug": payload.module_slug,
        "organization_id": str(org.id),
        "sincronizados": sincronizados,
        "total_usuarios": len(rows),
        "erros": erros,
    }
