import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_client_info, get_current_platform_admin
from app.core.database import get_db
from app.models.audit_event import AuditEvent
from app.models.module import Module
from app.models.organization_module import OrganizationModule
from app.models.user import User
from app.schemas.schemas import (
    ModuleCreate,
    ModuleResponse,
    ModuleUpdate,
    OrganizationModuleCreate,
    OrganizationModuleResponse,
)

router = APIRouter(prefix="/modules", tags=["modules"])


@router.get("", response_model=list[ModuleResponse])
async def list_modules(
    is_active: bool | None = Query(None),
    user: User = Depends(get_current_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    query = select(Module)
    if is_active is not None:
        query = query.where(Module.is_active == is_active)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{module_id}", response_model=ModuleResponse)
async def get_module(
    module_id: uuid.UUID,
    user: User = Depends(get_current_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Module).where(Module.id == module_id))
    module = result.scalar_one_or_none()
    if not module:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Module not found")
    return module


@router.post("", response_model=ModuleResponse, status_code=status.HTTP_201_CREATED)
async def create_module(
    body: ModuleCreate,
    request: Request,
    user: User = Depends(get_current_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(select(Module).where(Module.slug == body.slug))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Module slug already in use")

    module = Module(**body.model_dump())
    db.add(module)

    client_info = get_client_info(request)
    audit = AuditEvent(
        actor_id=user.id,
        actor_email=user.email,
        action="create",
        resource_type="module",
        resource_id=str(module.id),
        details={"name": module.name, "slug": module.slug},
        ip_address=client_info["ip_address"],
        user_agent=client_info["user_agent"],
    )
    db.add(audit)
    await db.commit()
    await db.refresh(module)
    return module


@router.put("/{module_id}", response_model=ModuleResponse)
async def update_module(
    module_id: uuid.UUID,
    body: ModuleUpdate,
    request: Request,
    user: User = Depends(get_current_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Module).where(Module.id == module_id))
    module = result.scalar_one_or_none()
    if not module:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Module not found")

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(module, key, value)

    client_info = get_client_info(request)
    audit = AuditEvent(
        actor_id=user.id,
        actor_email=user.email,
        action="update",
        resource_type="module",
        resource_id=str(module.id),
        details=update_data,
        ip_address=client_info["ip_address"],
        user_agent=client_info["user_agent"],
    )
    db.add(audit)
    await db.commit()
    await db.refresh(module)
    return module


@router.delete("/{module_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_module(
    module_id: uuid.UUID,
    request: Request,
    user: User = Depends(get_current_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Module).where(Module.id == module_id))
    module = result.scalar_one_or_none()
    if not module:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Module not found")
    module.is_active = False

    client_info = get_client_info(request)
    audit = AuditEvent(
        actor_id=user.id,
        actor_email=user.email,
        action="delete",
        resource_type="module",
        resource_id=str(module.id),
        ip_address=client_info["ip_address"],
        user_agent=client_info["user_agent"],
    )
    db.add(audit)
    await db.commit()


@router.get(
    "/organization/{org_id}",
    response_model=list[OrganizationModuleResponse],
)
async def list_org_modules(
    org_id: uuid.UUID,
    user: User = Depends(get_current_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy.orm import selectinload
    result = await db.execute(
        select(OrganizationModule)
        .where(OrganizationModule.organization_id == org_id)
        .options(selectinload(OrganizationModule.module))
    )
    return result.scalars().all()


@router.post(
    "/organization",
    response_model=OrganizationModuleResponse,
    status_code=status.HTTP_201_CREATED,
)
async def assign_module_to_org(
    body: OrganizationModuleCreate,
    request: Request,
    user: User = Depends(get_current_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(
        select(OrganizationModule).where(
            OrganizationModule.organization_id == body.organization_id,
            OrganizationModule.module_id == body.module_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Module already assigned to organization",
        )

    org_module = OrganizationModule(**body.model_dump())
    db.add(org_module)

    client_info = get_client_info(request)
    audit = AuditEvent(
        actor_id=user.id,
        actor_email=user.email,
        organization_id=body.organization_id,
        action="create",
        resource_type="organization_module",
        resource_id=str(org_module.id),
        ip_address=client_info["ip_address"],
        user_agent=client_info["user_agent"],
    )
    db.add(audit)
    await db.commit()
    await db.refresh(org_module)
    return org_module


@router.delete(
    "/organization/{org_module_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_module_from_org(
    org_module_id: uuid.UUID,
    request: Request,
    user: User = Depends(get_current_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(OrganizationModule).where(OrganizationModule.id == org_module_id)
    )
    org_module = result.scalar_one_or_none()
    if not org_module:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization module assignment not found",
        )

    client_info = get_client_info(request)
    audit = AuditEvent(
        actor_id=user.id,
        actor_email=user.email,
        organization_id=org_module.organization_id,
        action="delete",
        resource_type="organization_module",
        resource_id=str(org_module.id),
        ip_address=client_info["ip_address"],
        user_agent=client_info["user_agent"],
    )
    db.add(audit)

    await db.delete(org_module)
    await db.commit()
