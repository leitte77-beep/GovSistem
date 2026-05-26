import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import CurrentUser, get_current_user, require_roles
from app.core.database import get_db
from app.models.edition import Edition
from app.models.enums import EditionStatus
from app.models.signature import Signature

router = APIRouter(prefix="/signatures", tags=["signatures"])


@router.post("/{edition_id}")
async def sign_edition(
    edition_id: uuid.UUID,
    credential_id: uuid.UUID | None = Query(None),
    current: CurrentUser = Depends(require_roles("ASSINADOR", "ADMIN", "PLATFORM_ADMIN", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Edition).where(Edition.id == edition_id, Edition.organization_id == current.organization_id)
    )
    edition = result.scalar_one_or_none()
    if not edition:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Edition not found")
    if not EditionStatus.can_sign(edition.status):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Edition must be in pdf_generated status")

    from datetime import datetime, timezone
    signature = Signature(
        edition_id=edition_id,
        credential_id=credential_id,
        signed_by=current.id,
        signed_at=datetime.now(timezone.utc),
    )
    db.add(signature)
    edition.change_status(EditionStatus.SIGNED)
    await db.commit()
    return {"status": "signed", "signature_id": str(signature.id)}


@router.get("/{edition_id}")
async def list_signatures(
    edition_id: uuid.UUID,
    current: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Signature)
        .join(Edition)
        .where(Signature.edition_id == edition_id, Edition.organization_id == current.organization_id)
    )
    return result.scalars().all()
