import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import CurrentUser, get_current_user, require_roles
from app.core.database import get_db
from app.models.signing_credential import SigningCredential

router = APIRouter(prefix="/credentials", tags=["credentials"])


@router.get("")
async def list_credentials(
    current: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SigningCredential).where(SigningCredential.organization_id == current.organization_id)
    )
    return result.scalars().all()


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_credential(
    name: str = Query(...),
    provider_type: str = Query(...),
    current: CurrentUser = Depends(require_roles("ADMIN", "PLATFORM_ADMIN", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    credential = SigningCredential(
        organization_id=current.organization_id, name=name, provider_type=provider_type,
    )
    db.add(credential)
    await db.commit()
    await db.refresh(credential)
    return credential


@router.delete("/{credential_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_credential(
    credential_id: uuid.UUID,
    current: CurrentUser = Depends(require_roles("ADMIN", "PLATFORM_ADMIN", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SigningCredential).where(
            SigningCredential.id == credential_id,
            SigningCredential.organization_id == current.organization_id,
        )
    )
    credential = result.scalar_one_or_none()
    if not credential:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Credential not found")
    await db.delete(credential)
    await db.commit()
