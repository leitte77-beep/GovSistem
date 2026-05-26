import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import CurrentUser, get_client_info, get_current_user, require_roles
from app.core.database import get_db
from app.models.audit_event import AuditEvent
from app.models.edition import Edition
from app.models.edition_item import EditionItem
from app.models.enums import AuditAction, EditionStatus, EditionType, MatterStatus
from app.models.matter import Matter

router = APIRouter(prefix="/editions", tags=["editions"])


@router.get("")
async def list_editions(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    year: int | None = Query(None),
    status: str | None = Query(None),
    current: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Edition).where(Edition.organization_id == current.organization_id).options(selectinload(Edition.creator))
    if year:
        query = query.where(Edition.year == year)
    if status:
        query = query.where(Edition.status == status)
    query = query.offset(skip).limit(limit).order_by(Edition.year.desc(), Edition.number.desc())
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{edition_id}")
async def get_edition(
    edition_id: uuid.UUID,
    current: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Edition)
        .where(Edition.id == edition_id, Edition.organization_id == current.organization_id)
        .options(selectinload(Edition.items).selectinload(EditionItem.matter), selectinload(Edition.creator))
    )
    edition = result.scalar_one_or_none()
    if not edition:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Edition not found")
    return edition


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_edition(
    title: str = Query(...),
    publication_date: date = Query(...),
    type: str = Query("normal"),
    subtitle: str | None = Query(None),
    current: CurrentUser = Depends(require_roles("DIAGRAMADOR", "ADMIN", "PLATFORM_ADMIN", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    year = publication_date.year
    max_result = await db.execute(
        select(func.max(Edition.number)).where(
            Edition.organization_id == current.organization_id, Edition.year == year
        )
    )
    max_number = max_result.scalar() or 0
    number = max_number + 1

    edition = Edition(
        organization_id=current.organization_id,
        number=number,
        year=year,
        type=EditionType(type),
        title=title,
        subtitle=subtitle,
        publication_date=publication_date,
        created_by=current.id,
        status=EditionStatus.DRAFT,
    )
    db.add(edition)

    audit = AuditEvent(
        actor_id=current.id, organization_id=current.organization_id,
        action=AuditAction.EDITION_CREATED.value, resource_type="edition",
        resource_id=str(edition.id), details={"year": year, "number": number, "title": title},
    )
    db.add(audit)
    await db.commit()
    await db.refresh(edition)
    return edition


@router.patch("/{edition_id}")
async def update_edition(
    edition_id: uuid.UUID,
    title: str | None = Query(None),
    subtitle: str | None = Query(None),
    publication_date: date | None = Query(None),
    current: CurrentUser = Depends(require_roles("DIAGRAMADOR", "ADMIN", "PLATFORM_ADMIN", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Edition).where(Edition.id == edition_id, Edition.organization_id == current.organization_id)
    )
    edition = result.scalar_one_or_none()
    if not edition:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Edition not found")
    if not edition.can_edit():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Edition cannot be edited")

    if title is not None:
        edition.title = title
    if subtitle is not None:
        edition.subtitle = subtitle
    if publication_date is not None:
        edition.publication_date = publication_date

    await db.commit()
    await db.refresh(edition)
    return edition


@router.post("/{edition_id}/close")
async def close_edition(
    edition_id: uuid.UUID,
    current: CurrentUser = Depends(require_roles("DIAGRAMADOR", "ADMIN", "PLATFORM_ADMIN", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Edition).where(Edition.id == edition_id, Edition.organization_id == current.organization_id).options(selectinload(Edition.items))
    )
    edition = result.scalar_one_or_none()
    if not edition:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Edition not found")
    if len(edition.items) == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Edition has no items")

    edition.change_status(EditionStatus.CLOSED)
    edition.generate_verification_code()

    audit = AuditEvent(actor_id=current.id, organization_id=current.organization_id, action=AuditAction.EDITION_STATUS_CHANGED.value, resource_type="edition", resource_id=str(edition.id), details={"new_status": "closed"})
    db.add(audit)
    await db.commit()
    return {"status": edition.status.value, "verification_code": edition.verification_code}


@router.post("/{edition_id}/cancel")
async def cancel_edition(
    edition_id: uuid.UUID,
    current: CurrentUser = Depends(require_roles("DIAGRAMADOR", "ADMIN", "PLATFORM_ADMIN", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Edition).where(Edition.id == edition_id, Edition.organization_id == current.organization_id)
    )
    edition = result.scalar_one_or_none()
    if not edition:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Edition not found")
    edition.change_status(EditionStatus.CANCELLED)

    audit = AuditEvent(actor_id=current.id, organization_id=current.organization_id, action=AuditAction.EDITION_CANCELLED.value, resource_type="edition", resource_id=str(edition.id))
    db.add(audit)
    await db.commit()
    return {"status": edition.status.value}


@router.post("/{edition_id}/publish")
async def publish_edition(
    edition_id: uuid.UUID,
    current: CurrentUser = Depends(require_roles("PUBLICADOR", "ADMIN", "PLATFORM_ADMIN", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Edition).where(Edition.id == edition_id, Edition.organization_id == current.organization_id)
    )
    edition = result.scalar_one_or_none()
    if not edition:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Edition not found")
    if not EditionStatus.can_publish(edition.status):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Edition must be signed first")

    from datetime import datetime, timezone
    edition.status = EditionStatus.PUBLISHED
    edition.published_at = datetime.now(timezone.utc)
    edition.published_by = current.id

    items_result = await db.execute(
        select(EditionItem).where(EditionItem.edition_id == edition.id).options(selectinload(EditionItem.matter))
    )
    for item in items_result.scalars().all():
        item.matter.status = MatterStatus.PUBLISHED
        item.matter.published_at = datetime.now(timezone.utc)

    audit = AuditEvent(actor_id=current.id, organization_id=current.organization_id, action=AuditAction.EDITION_PUBLISHED.value, resource_type="edition", resource_id=str(edition.id))
    db.add(audit)
    await db.commit()
    return {"status": edition.status.value}


@router.get("/{edition_id}/items")
async def list_edition_items(
    edition_id: uuid.UUID,
    current: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(EditionItem)
        .join(Edition)
        .where(EditionItem.edition_id == edition_id, Edition.organization_id == current.organization_id)
        .options(selectinload(EditionItem.matter))
        .order_by(EditionItem.position)
    )
    return result.scalars().all()


@router.post("/{edition_id}/items", status_code=status.HTTP_201_CREATED)
async def add_item(
    edition_id: uuid.UUID,
    matter_id: uuid.UUID = Query(...),
    section_title: str | None = Query(None),
    current: CurrentUser = Depends(require_roles("DIAGRAMADOR", "ADMIN", "PLATFORM_ADMIN", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    edition_result = await db.execute(
        select(Edition).where(Edition.id == edition_id, Edition.organization_id == current.organization_id)
    )
    edition = edition_result.scalar_one_or_none()
    if not edition:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Edition not found")
    if not EditionStatus.can_add_items(edition.status):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot add items in current status")

    matter_result = await db.execute(
        select(Matter).where(Matter.id == matter_id, Matter.organization_id == current.organization_id, Matter.status == MatterStatus.APPROVED)
    )
    if not matter_result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Matter not found or not approved")

    max_pos = await db.execute(
        select(func.coalesce(func.max(EditionItem.position), -1)).where(EditionItem.edition_id == edition_id)
    )
    position = max_pos.scalar() + 1

    item = EditionItem(edition_id=edition_id, matter_id=matter_id, position=position, section_title=section_title)
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


@router.delete("/{edition_id}/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_item(
    edition_id: uuid.UUID,
    item_id: uuid.UUID,
    current: CurrentUser = Depends(require_roles("DIAGRAMADOR", "ADMIN", "PLATFORM_ADMIN", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(EditionItem)
        .join(Edition)
        .where(EditionItem.id == item_id, Edition.id == edition_id, Edition.organization_id == current.organization_id)
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    edition = item.edition
    if not EditionStatus.can_add_items(edition.status):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot modify items")
    await db.delete(item)
    await db.commit()


@router.delete("/{edition_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_edition(
    edition_id: uuid.UUID,
    current: CurrentUser = Depends(require_roles("DIAGRAMADOR", "ADMIN", "PLATFORM_ADMIN", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Edition).where(Edition.id == edition_id, Edition.organization_id == current.organization_id)
    )
    edition = result.scalar_one_or_none()
    if not edition:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Edition not found")
    if edition.status == EditionStatus.PUBLISHED:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete published edition")
    await db.delete(edition)
    await db.commit()
