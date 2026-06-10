import uuid
import re
import logging
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from pydantic import BaseModel

from app.core.auth import get_client_info, get_current_platform_admin, get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.core.roles import MODULE_ROLE_CATALOG, is_valid_grant
from app.core.security import hash_password
from app.models.audit_event import AuditEvent
from app.models.module import Module
from app.models.organization import Organization
from app.models.user import User
from app.models.user_module_grant import UserModuleGrant
from app.schemas.schemas import PaginatedResponse, UserCreate, UserResponse, UserUpdate

logger = logging.getLogger("saas.users")


def _clean_cpf(cpf: str) -> str:
    return re.sub(r"\D", "", cpf)


async def _check_cpf_exists(db: AsyncSession, cpf: str, exclude_id: uuid.UUID | None = None) -> bool:
    cleaned = _clean_cpf(cpf)
    if not cleaned:
        return False
    query = select(User).where(User.cpf == cleaned, User.deleted_at.is_(None))
    if exclude_id:
        query = query.where(User.id != exclude_id)
    result = await db.execute(query)
    return result.scalar_one_or_none() is not None


async def _sync_user_to_modules(user: User, db: AsyncSession) -> None:
    if not user.organization_id:
        return

    org_result = await db.execute(
        select(Organization).where(Organization.id == user.organization_id)
    )
    org = org_result.scalar_one_or_none()
    if not org:
        return

    grant_result = await db.execute(
        select(UserModuleGrant).where(UserModuleGrant.user_id == user.id)
    )
    grants = grant_result.scalars().all()
    module_slugs = list(dict.fromkeys(g.module_slug for g in grants))

    # Also include modules from legacy module_permissions JSON
    if user.module_permissions and isinstance(user.module_permissions, dict):
        legacy_modules = user.module_permissions.get("modules", [])
        for slug in legacy_modules:
            if slug not in module_slugs:
                module_slugs.append(slug)

    if not module_slugs:
        return

    internal_key = settings.INTERNAL_API_KEY.get_secret_value()
    if not internal_key:
        return

    org_payload = {
        "organization_id": str(org.id),
        "name": org.name,
        "slug": org.slug,
        "cnpj": org.cnpj,
        "description": org.description,
        "logo_url": org.logo_url,
        "public_url": org.public_url,
        "is_active": org.is_active,
    }

    # Collect all roles for the user (platform roles + module grant roles)
    all_roles = []
    if user.platform_role:
        all_roles.append(user.platform_role)
    if user.is_platform_admin:
        all_roles.append("PLATFORM_ADMIN")
    if user.is_organization_admin:
        all_roles.append("ADMIN")
    if user.organization_id:
        all_roles.append("ORG_MEMBER")
    for g in grants:
        all_roles.append(g.role_name)
    roles = list(dict.fromkeys(all_roles))

    user_payload = {
        "user_id": str(user.id),
        "organization_id": str(org.id),
        "name": user.name,
        "email": user.email,
        "is_active": user.is_active,
        "roles": roles,
    }

    module_configs = {
        "chatgov": settings.CHATGOV_MODULE_INTERNAL_API_URL,
        "diario": settings.DIARIO_MODULE_INTERNAL_API_URL,
    }

    for module_slug in module_slugs:
        api_url = module_configs.get(module_slug)
        if not api_url:
            continue
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                headers = {"X-Internal-Key": internal_key}
                await client.post(
                    f"{api_url}/internal/sync-organization",
                    json=org_payload,
                    headers=headers,
                )
                await client.post(
                    f"{api_url}/internal/sync-user",
                    json=user_payload,
                    headers=headers,
                )
        except Exception as e:
            logger.warning("Failed to sync user %s to module %s: %s", user.id, module_slug, e)


router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=PaginatedResponse)
async def list_users(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    search: str | None = Query(None),
    organization_id: uuid.UUID | None = Query(None),
    is_active: bool | None = Query(None),
    _: User = Depends(get_current_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    query = select(User).where(User.deleted_at.is_(None))
    count_query = select(func.count(User.id)).where(User.deleted_at.is_(None))

    if search:
        like = f"%{search}%"
        query = query.where(User.name.ilike(like) | User.email.ilike(like))
        count_query = count_query.where(User.name.ilike(like) | User.email.ilike(like))
    if organization_id:
        query = query.where(User.organization_id == organization_id)
        count_query = count_query.where(User.organization_id == organization_id)
    if is_active is not None:
        query = query.where(User.is_active == is_active)
        count_query = count_query.where(User.is_active == is_active)

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    skip = (page - 1) * per_page
    query = query.offset(skip).limit(per_page).order_by(User.name)
    result = await db.execute(query)
    items = result.scalars().all()

    return PaginatedResponse(data=[UserResponse.model_validate(u) for u in items], total=total, page=page, per_page=per_page)


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    target_user = user
    if user_id != user.id and not user.is_platform_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    if user_id != user.id:
        result = await db.execute(
            select(User).where(User.id == user_id, User.deleted_at.is_(None))
        )
        target_user = result.scalar_one_or_none()
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return target_user


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    body: UserCreate,
    request: Request,
    admin: User = Depends(get_current_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already in use")

    if body.cpf:
        cleaned_cpf = _clean_cpf(body.cpf)
        if await _check_cpf_exists(db, cleaned_cpf):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="CPF already registered")
    else:
        cleaned_cpf = None

    data = body.model_dump(exclude={"password"})
    module_perms = data.pop("module_permissions", None)
    if module_perms:
        data["module_permissions"] = {"modules": module_perms}

    user = User(
        **data,
        password_hash=hash_password(body.password),
        password_changed_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    db.add(user)

    client_info = get_client_info(request)
    audit = AuditEvent(
        actor_id=admin.id,
        actor_email=admin.email,
        organization_id=user.organization_id,
        action="create",
        resource_type="user",
        resource_id=str(user.id),
        details={"name": user.name, "email": user.email, "organization_id": str(user.organization_id) if user.organization_id else None},
        ip_address=client_info["ip_address"],
        user_agent=client_info["user_agent"],
    )
    db.add(audit)
    await db.commit()
    await db.refresh(user)
    await _sync_user_to_modules(user, db)
    return user


@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: uuid.UUID,
    body: UserUpdate,
    request: Request,
    admin: User = Depends(get_current_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User).where(User.id == user_id, User.deleted_at.is_(None))
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    update_data = body.model_dump(exclude_unset=True)
    if "email" in update_data and not update_data["email"]:
        del update_data["email"]
    if "organization_id" in update_data:
        if not update_data["organization_id"]:
            update_data["organization_id"] = None
        elif isinstance(update_data["organization_id"], uuid.UUID):
            update_data["organization_id"] = update_data["organization_id"]
    if "module_permissions" in update_data:
        perms = update_data.pop("module_permissions")
        update_data["module_permissions"] = {"modules": perms} if perms else None
    if "cpf" in update_data:
        if update_data["cpf"]:
            cleaned_cpf = _clean_cpf(update_data["cpf"])
            if await _check_cpf_exists(db, cleaned_cpf, exclude_id=user.id):
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="CPF already registered")
            update_data["cpf"] = cleaned_cpf
        else:
            update_data["cpf"] = None
    if "password" in update_data:
        update_data["password_hash"] = hash_password(update_data.pop("password"))
        update_data["password_changed_at"] = datetime.now(timezone.utc).replace(tzinfo=None)
    for key, value in update_data.items():
        setattr(user, key, value)

    client_info = get_client_info(request)
    audit_details = {}
    for k, v in update_data.items():
        if k in ("password_hash", "password_changed_at"):
            continue
        if isinstance(v, uuid.UUID):
            audit_details[k] = str(v)
        elif isinstance(v, datetime):
            audit_details[k] = v.isoformat()
        else:
            audit_details[k] = v

    audit = AuditEvent(
        actor_id=admin.id,
        actor_email=admin.email,
        organization_id=user.organization_id,
        action="update",
        resource_type="user",
        resource_id=str(user.id),
        details=audit_details,
        ip_address=client_info["ip_address"],
        user_agent=client_info["user_agent"],
    )
    db.add(audit)
    await db.commit()
    await db.refresh(user)
    await _sync_user_to_modules(user, db)
    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: uuid.UUID,
    request: Request,
    admin: User = Depends(get_current_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User).where(User.id == user_id, User.deleted_at.is_(None))
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.deleted_at = datetime.now(timezone.utc)
    user.is_active = False

    client_info = get_client_info(request)
    audit = AuditEvent(
        actor_id=admin.id,
        actor_email=admin.email,
        organization_id=user.organization_id,
        action="delete",
        resource_type="user",
        resource_id=str(user.id),
        ip_address=client_info["ip_address"],
        user_agent=client_info["user_agent"],
    )
    db.add(audit)
    await db.commit()


# ---------------------------------------------------------------------------
# Per-module access grants ("quem pode o quê")
# ---------------------------------------------------------------------------


class ModuleRoleCatalogItem(BaseModel):
    name: str
    label: str


class ModuleGrantsBody(BaseModel):
    # { "diario": ["AUTOR", "DIAGRAMADOR"], "chatgov": ["CHATGOV_USER"] }
    grants: dict[str, list[str]]


@router.get("/roles/catalog")
async def get_roles_catalog(
    _: User = Depends(get_current_platform_admin),
):
    """Available per-module roles the admin can grant."""
    return MODULE_ROLE_CATALOG


@router.get("/{user_id}/grants")
async def get_user_grants(
    user_id: uuid.UUID,
    _: User = Depends(get_current_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(UserModuleGrant).where(UserModuleGrant.user_id == user_id)
    )
    grants: dict[str, list[str]] = {}
    for g in result.scalars().all():
        grants.setdefault(g.module_slug, []).append(g.role_name)
    return {"grants": grants}


@router.put("/{user_id}/grants")
async def set_user_grants(
    user_id: uuid.UUID,
    body: ModuleGrantsBody,
    request: Request,
    admin: User = Depends(get_current_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User).where(User.id == user_id, User.deleted_at.is_(None))
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Validate every requested (module, role) against the catalog.
    for module_slug, role_names in body.grants.items():
        for role_name in role_names:
            if not is_valid_grant(module_slug, role_name):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Invalid role '{role_name}' for module '{module_slug}'",
                )

    # Replace the full set of grants (insert/delete semantics).
    existing_result = await db.execute(
        select(UserModuleGrant).where(UserModuleGrant.user_id == user_id)
    )
    for g in existing_result.scalars().all():
        await db.delete(g)
    await db.flush()  # apply deletes before inserts to avoid unique-key clash

    for module_slug, role_names in body.grants.items():
        for role_name in dict.fromkeys(role_names):  # dedupe, keep order
            db.add(
                UserModuleGrant(
                    user_id=user_id,
                    module_slug=module_slug,
                    role_name=role_name,
                )
            )

    client_info = get_client_info(request)
    audit = AuditEvent(
        actor_id=admin.id,
        actor_email=admin.email,
        organization_id=user.organization_id,
        action="update",
        resource_type="user_grants",
        resource_id=str(user.id),
        details={"grants": body.grants},
        ip_address=client_info["ip_address"],
        user_agent=client_info["user_agent"],
    )
    db.add(audit)
    await db.commit()
    await _sync_user_to_modules(user, db)
    return {"grants": body.grants}
