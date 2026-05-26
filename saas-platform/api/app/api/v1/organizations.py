import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_client_info, get_current_platform_admin, get_current_user
from app.core.database import get_db
from app.core.security import hash_password
from app.models.audit_event import AuditEvent
from app.models.organization import Organization
from app.models.user import User
from app.schemas.schemas import (
    OrganizationCreate,
    OrganizationResponse,
    OrganizationUpdate,
    PaginatedResponse,
)

router = APIRouter(prefix="/organizations", tags=["organizations"])


@router.get("", response_model=PaginatedResponse)
async def list_organizations(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    search: str | None = Query(None),
    is_active: bool | None = Query(None),
    user: User = Depends(get_current_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    query = select(Organization).where(Organization.deleted_at.is_(None))
    count_query = select(func.count(Organization.id)).where(Organization.deleted_at.is_(None))

    if search:
        like = f"%{search}%"
        query = query.where(
            Organization.name.ilike(like)
            | Organization.slug.ilike(like)
            | Organization.cnpj.ilike(like)
        )
        count_query = count_query.where(
            Organization.name.ilike(like)
            | Organization.slug.ilike(like)
            | Organization.cnpj.ilike(like)
        )
    if is_active is not None:
        query = query.where(Organization.is_active == is_active)
        count_query = count_query.where(Organization.is_active == is_active)

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    skip = (page - 1) * per_page
    query = query.offset(skip).limit(per_page).order_by(Organization.name)
    result = await db.execute(query)
    items = result.scalars().all()

    org_ids = [o.id for o in items]
    user_counts = {}
    if org_ids:
        count_result = await db.execute(
            select(User.organization_id, func.count(User.id))
            .where(User.organization_id.in_(org_ids), User.deleted_at.is_(None))
            .group_by(User.organization_id)
        )
        for org_id, cnt in count_result:
            user_counts[org_id] = cnt

    data = []
    for o in items:
        org_dict = OrganizationResponse.model_validate(o).model_dump()
        org_dict["user_count"] = user_counts.get(o.id, 0)
        data.append(org_dict)

    return PaginatedResponse(data=data, total=total, page=page, per_page=per_page)


@router.get("/{org_id}", response_model=OrganizationResponse)
async def get_organization(
    org_id: uuid.UUID,
    user: User = Depends(get_current_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Organization).where(
            Organization.id == org_id, Organization.deleted_at.is_(None)
        )
    )
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    return org


@router.post("", response_model=OrganizationResponse, status_code=status.HTTP_201_CREATED)
async def create_organization(
    body: OrganizationCreate,
    request: Request,
    user: User = Depends(get_current_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import or_
    existing = await db.execute(
        select(Organization).where(
            or_(Organization.slug == body.slug, Organization.cnpj == body.cnpj) if body.cnpj
            else Organization.slug == body.slug
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Slug or CNPJ already in use"
        )

    admin_fields = {"admin_name", "admin_email", "admin_password", "plan_slug"}
    org_data = {k: v for k, v in body.model_dump().items() if k not in admin_fields}

    org = Organization(**org_data)
    db.add(org)
    await db.flush()

    if body.admin_name and body.admin_email and body.admin_password:
        existing_admin = await db.execute(
            select(User).where(User.email == body.admin_email)
        )
        if existing_admin.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="Admin email already in use"
            )
        admin_user = User(
            organization_id=org.id,
            name=body.admin_name,
            email=body.admin_email,
            password_hash=hash_password(body.admin_password),
            is_platform_admin=False,
            is_active=True,
        )
        db.add(admin_user)

    client_info = get_client_info(request)
    audit = AuditEvent(
        actor_id=user.id,
        actor_email=user.email,
        organization_id=org.id,
        action="create",
        resource_type="organization",
        resource_id=str(org.id),
        details={"name": org.name, "slug": org.slug},
        ip_address=client_info["ip_address"],
        user_agent=client_info["user_agent"],
    )
    db.add(audit)
    await db.commit()
    await db.refresh(org)
    return org


@router.put("/{org_id}", response_model=OrganizationResponse)
async def update_organization(
    org_id: uuid.UUID,
    body: OrganizationUpdate,
    request: Request,
    user: User = Depends(get_current_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Organization).where(
            Organization.id == org_id, Organization.deleted_at.is_(None)
        )
    )
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(org, key, value)

    client_info = get_client_info(request)
    audit = AuditEvent(
        actor_id=user.id,
        actor_email=user.email,
        organization_id=org.id,
        action="update",
        resource_type="organization",
        resource_id=str(org.id),
        details=update_data,
        ip_address=client_info["ip_address"],
        user_agent=client_info["user_agent"],
    )
    db.add(audit)
    await db.commit()
    await db.refresh(org)
    return org


@router.delete("/{org_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_organization(
    org_id: uuid.UUID,
    request: Request,
    user: User = Depends(get_current_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Organization).where(
            Organization.id == org_id, Organization.deleted_at.is_(None)
        )
    )
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

    org.deleted_at = datetime.now(timezone.utc)
    org.is_active = False

    client_info = get_client_info(request)
    audit = AuditEvent(
        actor_id=user.id,
        actor_email=user.email,
        organization_id=org.id,
        action="delete",
        resource_type="organization",
        resource_id=str(org.id),
        ip_address=client_info["ip_address"],
        user_agent=client_info["user_agent"],
    )
    db.add(audit)
    await db.commit()
