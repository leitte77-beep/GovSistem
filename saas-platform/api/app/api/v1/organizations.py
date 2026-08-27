import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_client_info, get_current_platform_admin, get_current_user
from app.core.database import get_db
from app.core.security import hash_password
from app.models.audit_event import AuditEvent
from app.models.module import Module
from app.models.organization import Organization
from app.models.organization_membership import OrganizationMembership
from app.models.organization_module import OrganizationModule
from app.models.user import User
from app.schemas.schemas import (
    OrganizationCreate,
    OrganizationManagerRequest,
    OrganizationResponse,
    OrganizationUpdate,
    PaginatedResponse,
)

router = APIRouter(prefix="/organizations", tags=["organizations"])


SORTABLE_ORG_FIELDS = {
    "name": Organization.name,
    "slug": Organization.slug,
    "created_at": Organization.created_at,
    "is_active": Organization.is_active,
}


@router.get("", response_model=PaginatedResponse)
async def list_organizations(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    search: str | None = Query(None),
    is_active: bool | None = Query(None),
    sort: str = Query("name"),
    order: str = Query("asc", pattern="^(asc|desc)$"),
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

    sort_column = SORTABLE_ORG_FIELDS.get(sort, Organization.name)
    query = query.order_by(desc(sort_column) if order == "desc" else sort_column)

    skip = (page - 1) * per_page
    query = query.offset(skip).limit(per_page)
    result = await db.execute(query)
    items = result.scalars().all()

    org_ids = [o.id for o in items]
    user_counts = {}
    active_user_counts = {}
    org_modules: dict[uuid.UUID, list[dict]] = {}
    if org_ids:
        count_result = await db.execute(
            select(User.organization_id, func.count(User.id))
            .where(User.organization_id.in_(org_ids), User.deleted_at.is_(None))
            .group_by(User.organization_id)
        )
        for org_id, cnt in count_result:
            user_counts[org_id] = cnt

        active_result = await db.execute(
            select(User.organization_id, func.count(User.id))
            .where(
                User.organization_id.in_(org_ids),
                User.deleted_at.is_(None),
                User.is_active.is_(True),
            )
            .group_by(User.organization_id)
        )
        for org_id, cnt in active_result:
            active_user_counts[org_id] = cnt

        modules_result = await db.execute(
            select(OrganizationModule.organization_id, Module.slug, Module.name)
            .join(Module, Module.id == OrganizationModule.module_id)
            .where(
                OrganizationModule.organization_id.in_(org_ids),
                OrganizationModule.is_active.is_(True),
            )
            .order_by(Module.name)
        )
        for org_id, slug, name in modules_result:
            org_modules.setdefault(org_id, []).append({"slug": slug, "name": name})

    data = []
    for o in items:
        org_dict = OrganizationResponse.model_validate(o).model_dump()
        org_dict["user_count"] = user_counts.get(o.id, 0)
        org_dict["active_user_count"] = active_user_counts.get(o.id, 0)
        org_dict["modules"] = org_modules.get(o.id, [])
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
            is_organization_admin=True,
            is_active=True,
        )
        db.add(admin_user)
        await db.flush()
        # Primeiro gestor no novo modelo multi-tenant: membership ORG_ADMIN ativo.
        db.add(
            OrganizationMembership(
                organization_id=org.id,
                user_id=admin_user.id,
                membership_role="ORG_ADMIN",
                status="active",
                is_active=True,
                created_by=user.id,
            )
        )

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


@router.post("/{org_id}/managers", status_code=status.HTTP_201_CREATED)
async def set_organization_manager(
    org_id: uuid.UUID,
    body: OrganizationManagerRequest,
    request: Request,
    admin: User = Depends(get_current_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    """Define/substitui/adiciona um gestor (ORG_ADMIN) do órgão.

    Aceita `user_id` (promove usuário existente) ou `name`+`email`+`password`
    (cria novo usuário já como gestor). Cria ou promove o membership ORG_ADMIN.
    """
    org = (
        await db.execute(
            select(Organization).where(Organization.id == org_id, Organization.deleted_at.is_(None))
        )
    ).scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organização não encontrada")

    if body.user_id:
        target = (
            await db.execute(
                select(User).where(User.id == body.user_id, User.deleted_at.is_(None))
            )
        ).scalar_one_or_none()
        if not target:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado")
    elif body.email:
        existing = (
            await db.execute(select(User).where(User.email == body.email, User.deleted_at.is_(None)))
        ).scalar_one_or_none()
        if existing:
            target = existing  # identidade existente: vincula como gestor, preserva senha
        else:
            if not (body.name and body.password):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="name e password são necessários para criar um novo usuário",
                )
            target = User(
                organization_id=org.id,
                name=body.name,
                email=body.email,
                password_hash=hash_password(body.password),
                is_platform_admin=False,
                is_organization_admin=True,
                is_active=True,
            )
            db.add(target)
            await db.flush()
    else:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Informe user_id ou email",
        )

    # mantém compat legado
    target.organization_id = org.id
    target.is_organization_admin = True

    mem = (
        await db.execute(
            select(OrganizationMembership).where(
                OrganizationMembership.organization_id == org.id,
                OrganizationMembership.user_id == target.id,
                OrganizationMembership.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if mem:
        mem.membership_role = "ORG_ADMIN"
        mem.is_active = True
        mem.status = "active"
        mem.updated_by = admin.id
    else:
        db.add(
            OrganizationMembership(
                organization_id=org.id,
                user_id=target.id,
                membership_role="ORG_ADMIN",
                status="active",
                is_active=True,
                created_by=admin.id,
            )
        )

    client_info = get_client_info(request)
    db.add(
        AuditEvent(
            actor_id=admin.id,
            actor_email=admin.email,
            organization_id=org.id,
            action="manager_assign",
            resource_type="organization",
            resource_id=str(org.id),
            details={"user_id": str(target.id), "email": target.email, "role": "ORG_ADMIN"},
            ip_address=client_info["ip_address"],
            user_agent=client_info["user_agent"],
        )
    )
    await db.commit()
    return {"organization_id": str(org.id), "user_id": str(target.id), "role": "ORG_ADMIN"}


@router.get("/{org_id}/managers")
async def list_organization_managers(
    org_id: uuid.UUID,
    user: User = Depends(get_current_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    """Lista os gestores (memberships ORG_ADMIN ativos) do órgão."""
    rows = (
        await db.execute(
            select(OrganizationMembership, User)
            .join(User, User.id == OrganizationMembership.user_id)
            .where(
                OrganizationMembership.organization_id == org_id,
                OrganizationMembership.membership_role == "ORG_ADMIN",
                OrganizationMembership.deleted_at.is_(None),
            )
            .order_by(User.name)
        )
    ).all()
    return [
        {
            "user_id": str(m.user_id),
            "membership_id": str(m.id),
            "name": u.name,
            "email": u.email,
            "is_active": m.is_active,
            "global_active": u.is_active,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        }
        for m, u in rows
    ]


@router.delete("/{org_id}/managers/{user_id}")
async def remove_organization_manager(
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    request: Request,
    admin: User = Depends(get_current_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    """Remove um gestor (rebaixa o membership para ORG_MEMBER).

    Protege o último gestor ativo do órgão.
    """
    org = (
        await db.execute(
            select(Organization).where(Organization.id == org_id, Organization.deleted_at.is_(None))
        )
    ).scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organização não encontrada")

    mem = (
        await db.execute(
            select(OrganizationMembership).where(
                OrganizationMembership.organization_id == org_id,
                OrganizationMembership.user_id == user_id,
                OrganizationMembership.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if not mem:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vínculo não encontrado")

    if mem.membership_role == "ORG_ADMIN":
        active_admins = (
            await db.execute(
                select(func.count(OrganizationMembership.id)).where(
                    OrganizationMembership.organization_id == org_id,
                    OrganizationMembership.membership_role == "ORG_ADMIN",
                    OrganizationMembership.is_active.is_(True),
                    OrganizationMembership.deleted_at.is_(None),
                )
            )
        ).scalar() or 0
        if active_admins <= 1:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Não é possível remover o último gestor ativo",
            )

    mem.membership_role = "ORG_MEMBER"
    mem.updated_by = admin.id
    target_user = (
        await db.execute(select(User).where(User.id == user_id))
    ).scalar_one_or_none()
    if target_user:
        target_user.is_organization_admin = False

    client_info = get_client_info(request)
    db.add(
        AuditEvent(
            actor_id=admin.id,
            actor_email=admin.email,
            organization_id=org.id,
            action="manager_remove",
            resource_type="organization",
            resource_id=str(org.id),
            details={"user_id": str(user_id)},
            ip_address=client_info["ip_address"],
            user_agent=client_info["user_agent"],
        )
    )
    await db.commit()
    return {"organization_id": str(org.id), "user_id": str(user_id), "role": "ORG_MEMBER"}
