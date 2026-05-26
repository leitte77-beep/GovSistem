import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import CurrentUser, get_client_info, get_current_user, require_roles
from app.core.database import get_db
from app.models.act_type import ActType
from app.models.audit_event import AuditEvent
from app.models.enums import AuditAction, MatterStatus
from app.models.matter import Matter
from app.models.org_unit import OrgUnit

router = APIRouter(prefix="/matters", tags=["matters"])


@router.get("")
async def list_matters(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    search: str | None = Query(None),
    status: str | None = Query(None),
    act_type_id: uuid.UUID | None = Query(None),
    org_unit_id: uuid.UUID | None = Query(None),
    current: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(Matter)
        .where(Matter.organization_id == current.organization_id)
        .options(selectinload(Matter.author), selectinload(Matter.act_type), selectinload(Matter.org_unit))
    )
    if search:
        query = query.where(
            Matter.title.ilike(f"%{search}%") | Matter.plain_text.ilike(f"%{search}%")
        )
    if status:
        query = query.where(Matter.status == status)
    if act_type_id:
        query = query.where(Matter.act_type_id == act_type_id)
    if org_unit_id:
        query = query.where(Matter.org_unit_id == org_unit_id)
    query = query.offset(skip).limit(limit).order_by(Matter.created_at.desc())
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/next-title")
async def next_title(
    act_type_id: uuid.UUID | None = Query(None),
    current: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    count_result = await db.execute(
        select(func.count(Matter.id)).where(
            Matter.organization_id == current.organization_id,
            Matter.act_type_id == act_type_id if act_type_id else True,
        )
    )
    count = count_result.scalar() or 0
    return {"next_number": count + 1}


@router.get("/{matter_id}")
async def get_matter(
    matter_id: uuid.UUID,
    current: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Matter)
        .where(Matter.id == matter_id, Matter.organization_id == current.organization_id)
        .options(selectinload(Matter.author), selectinload(Matter.act_type), selectinload(Matter.org_unit), selectinload(Matter.attachments))
    )
    matter = result.scalar_one_or_none()
    if not matter:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Matter not found")
    return matter


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_matter(
    title: str = Query(...),
    content_html: str = Query(...),
    plain_text: str = Query(...),
    act_type_id: uuid.UUID = Query(...),
    org_unit_id: uuid.UUID | None = Query(None),
    summary: str | None = Query(None),
    current: CurrentUser = Depends(require_roles("AUTOR", "ADMIN", "PLATFORM_ADMIN", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
    request: Request = None,
):
    act_result = await db.execute(
        select(ActType).where(ActType.id == act_type_id, ActType.organization_id == current.organization_id)
    )
    if not act_result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid act type")

    matter = Matter(
        organization_id=current.organization_id,
        act_type_id=act_type_id,
        org_unit_id=org_unit_id,
        title=title,
        content_html=content_html,
        plain_text=plain_text,
        summary=summary,
        author_id=current.id,
        status=MatterStatus.DRAFT,
    )
    db.add(matter)

    audit = AuditEvent(
        actor_id=current.id,
        organization_id=current.organization_id,
        action=AuditAction.MATTER_CREATED.value,
        resource_type="matter",
        resource_id=str(matter.id),
        details={"title": title},
    )
    db.add(audit)
    await db.commit()
    await db.refresh(matter)
    return matter


@router.patch("/{matter_id}")
async def update_matter(
    matter_id: uuid.UUID,
    title: str | None = Query(None),
    content_html: str | None = Query(None),
    plain_text: str | None = Query(None),
    summary: str | None = Query(None),
    current: CurrentUser = Depends(require_roles("AUTOR", "ADMIN", "PLATFORM_ADMIN", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Matter).where(Matter.id == matter_id, Matter.organization_id == current.organization_id)
    )
    matter = result.scalar_one_or_none()
    if not matter:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Matter not found")
    if not matter.can_edit():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Matter cannot be edited in current status")

    if title is not None:
        matter.title = title
    if content_html is not None:
        matter.content_html = content_html
    if plain_text is not None:
        matter.plain_text = plain_text
    if summary is not None:
        matter.summary = summary

    audit = AuditEvent(
        actor_id=current.id,
        organization_id=current.organization_id,
        action=AuditAction.MATTER_UPDATED.value,
        resource_type="matter",
        resource_id=str(matter.id),
    )
    db.add(audit)
    await db.commit()
    await db.refresh(matter)
    return matter


@router.post("/{matter_id}/submit-review")
async def submit_review(
    matter_id: uuid.UUID,
    current: CurrentUser = Depends(require_roles("AUTOR", "ADMIN", "PLATFORM_ADMIN", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Matter).where(Matter.id == matter_id, Matter.organization_id == current.organization_id)
    )
    matter = result.scalar_one_or_none()
    if not matter:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Matter not found")
    matter.change_status(MatterStatus.REVIEW)
    audit = AuditEvent(actor_id=current.id, organization_id=current.organization_id, action=AuditAction.MATTER_STATUS_CHANGED.value, resource_type="matter", resource_id=str(matter.id), details={"new_status": "review"})
    db.add(audit)
    await db.commit()
    return {"status": matter.status.value}


@router.post("/{matter_id}/approve")
async def approve_matter(
    matter_id: uuid.UUID,
    current: CurrentUser = Depends(require_roles("REVISOR", "ADMIN", "PLATFORM_ADMIN", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Matter).where(Matter.id == matter_id, Matter.organization_id == current.organization_id)
    )
    matter = result.scalar_one_or_none()
    if not matter:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Matter not found")
    matter.change_status(MatterStatus.APPROVED)
    matter.reviewed_by = current.id
    audit = AuditEvent(actor_id=current.id, organization_id=current.organization_id, action=AuditAction.MATTER_STATUS_CHANGED.value, resource_type="matter", resource_id=str(matter.id), details={"new_status": "approved"})
    db.add(audit)
    await db.commit()
    return {"status": matter.status.value}


@router.post("/{matter_id}/reject")
async def reject_matter(
    matter_id: uuid.UUID,
    current: CurrentUser = Depends(require_roles("REVISOR", "ADMIN", "PLATFORM_ADMIN", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Matter).where(Matter.id == matter_id, Matter.organization_id == current.organization_id)
    )
    matter = result.scalar_one_or_none()
    if not matter:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Matter not found")
    matter.change_status(MatterStatus.REJECTED)
    matter.reviewed_by = current.id
    audit = AuditEvent(actor_id=current.id, organization_id=current.organization_id, action=AuditAction.MATTER_STATUS_CHANGED.value, resource_type="matter", resource_id=str(matter.id), details={"new_status": "rejected"})
    db.add(audit)
    await db.commit()
    return {"status": matter.status.value}


@router.post("/{matter_id}/archive")
async def archive_matter(
    matter_id: uuid.UUID,
    current: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Matter).where(Matter.id == matter_id, Matter.organization_id == current.organization_id)
    )
    matter = result.scalar_one_or_none()
    if not matter:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Matter not found")
    matter.change_status(MatterStatus.ARCHIVED)
    await db.commit()
    return {"status": matter.status.value}


@router.delete("/{matter_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_matter(
    matter_id: uuid.UUID,
    current: CurrentUser = Depends(require_roles("AUTOR", "ADMIN", "PLATFORM_ADMIN", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Matter).where(Matter.id == matter_id, Matter.organization_id == current.organization_id)
    )
    matter = result.scalar_one_or_none()
    if not matter:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Matter not found")
    if matter.status == MatterStatus.PUBLISHED:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete published matter")
    await db.delete(matter)
    await db.commit()
