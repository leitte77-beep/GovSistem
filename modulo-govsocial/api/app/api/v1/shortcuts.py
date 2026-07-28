from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import get_current_user
from app.core.database import get_db
from app.models.external_shortcut import ExternalShortcut
from app.models.user import User
from app.schemas import ExternalShortcutCreate, ExternalShortcutUpdate, ExternalShortcutResponse

router = APIRouter(prefix="/shortcuts", tags=["shortcuts"])


@router.get("", response_model=list[ExternalShortcutResponse])
async def list_shortcuts(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(ExternalShortcut)
        .where(
            ExternalShortcut.tenant_id == str(user.organization_id),
            ExternalShortcut.deleted_at.is_(None),
            ExternalShortcut.is_active == True,
        )
        .order_by(ExternalShortcut.ordem, ExternalShortcut.label)
    )
    result = await db.execute(query)
    return [_shortcut_to_response(s) for s in result.scalars().all()]


@router.post("", response_model=ExternalShortcutResponse)
async def create_shortcut(
    body: ExternalShortcutCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    shortcut = ExternalShortcut(
        tenant_id=str(user.organization_id),
        label=body.label,
        url=body.url,
        icon=body.icon,
        ordem=body.ordem,
        description=body.description,
    )
    db.add(shortcut)
    await db.commit()
    await db.refresh(shortcut)
    return _shortcut_to_response(shortcut)


@router.patch("/{shortcut_id}", response_model=ExternalShortcutResponse)
async def update_shortcut(
    shortcut_id: UUID,
    body: ExternalShortcutUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    shortcut = await db.get(ExternalShortcut, shortcut_id)
    if not shortcut or str(shortcut.tenant_id) != str(user.organization_id):
        raise HTTPException(status_code=404, detail="Atalho não encontrado")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(shortcut, field, value)
    shortcut.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(shortcut)
    return _shortcut_to_response(shortcut)


@router.delete("/{shortcut_id}")
async def delete_shortcut(
    shortcut_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    shortcut = await db.get(ExternalShortcut, shortcut_id)
    if not shortcut or str(shortcut.tenant_id) != str(user.organization_id):
        raise HTTPException(status_code=404, detail="Atalho não encontrado")

    shortcut.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    return {"ok": True}


def _shortcut_to_response(s: ExternalShortcut) -> dict:
    return ExternalShortcutResponse(
        id=str(s.id),
        label=s.label,
        url=s.url,
        icon=s.icon,
        ordem=s.ordem,
        is_active=s.is_active,
        description=s.description,
        created_at=s.created_at.isoformat() if s.created_at else None,
        updated_at=s.updated_at.isoformat() if s.updated_at else None,
    )
