import uuid

from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import require_internal_key
from app.core.database import get_db
from app.models.edition import Edition
from app.models.edition_item import EditionItem
from app.models.enums import EditionStatus
from app.models.organization import Organization
from app.models.role import Role
from app.models.setting import SystemSetting
from app.models.user import User
from app.models.user_role import UserRole

router = APIRouter()


class OrganizationSyncPayload(BaseModel):
    organization_id: str
    name: str
    slug: str
    cnpj: str | None = None
    description: str | None = None
    logo_url: str | None = None
    public_url: str | None = None
    is_active: bool = True


class UserSyncPayload(BaseModel):
    user_id: str
    organization_id: str
    name: str
    email: str
    is_active: bool = True
    roles: list[str] = Field(default_factory=list)


def _module_roles(platform_roles: list[str]) -> set[str]:
    roles = set(platform_roles)
    if roles.intersection({"SUPER_ADMIN", "PLATFORM_ADMIN", "ADMIN", "SUPPORT"}):
        return {"ADMIN"}
    if "AUDITOR" in roles:
        return {"AUDITOR"}
    return {"AUTOR"}


@router.post("/internal/sync-organization")
async def sync_organization(
    payload: OrganizationSyncPayload,
    _: None = Depends(require_internal_key),
    db: AsyncSession = Depends(get_db),
):
    organization_id = uuid.UUID(payload.organization_id)
    result = await db.execute(
        select(Organization).where(
            or_(Organization.id == organization_id, Organization.slug == payload.slug)
        )
    )
    org = result.scalar_one_or_none()
    if not org:
        org = Organization(
            id=organization_id,
            name=payload.name,
            slug=payload.slug,
            cnpj=payload.cnpj,
            description=payload.description,
            logo_url=payload.logo_url,
            public_url=payload.public_url,
            is_active=payload.is_active,
        )
        db.add(org)
    else:
        org.name = payload.name
        org.slug = payload.slug
        org.cnpj = payload.cnpj
        org.description = payload.description
        org.logo_url = payload.logo_url
        org.public_url = payload.public_url
        org.is_active = payload.is_active
    await db.commit()
    await db.refresh(org)
    return {"status": "ok", "organization_id": str(org.id)}


@router.post("/internal/sync-user")
async def sync_user(
    payload: UserSyncPayload,
    _: None = Depends(require_internal_key),
    db: AsyncSession = Depends(get_db),
):
    user_id = uuid.UUID(payload.user_id)
    organization_id = uuid.UUID(payload.organization_id)
    result = await db.execute(
        select(User).where(or_(User.id == user_id, User.email == payload.email))
    )
    user = result.scalar_one_or_none()
    if not user:
        user = User(
            id=user_id,
            organization_id=organization_id,
            name=payload.name,
            email=payload.email,
            is_active=payload.is_active,
        )
        db.add(user)
    else:
        user.organization_id = organization_id
        user.name = payload.name
        user.email = payload.email
        user.is_active = payload.is_active

    module_roles = _module_roles(payload.roles)
    role_result = await db.execute(select(Role).where(Role.name.in_(module_roles)))
    role_by_name = {role.name: role for role in role_result.scalars().all()}
    for role_name in module_roles:
        role = role_by_name.get(role_name)
        if not role:
            continue
        exists = await db.execute(
            select(UserRole).where(
                UserRole.user_id == user.id,
                UserRole.role_id == role.id,
            )
        )
        if exists.scalar_one_or_none() is None:
            db.add(UserRole(user_id=user.id, role_id=role.id))
    await db.commit()
    await db.refresh(user)
    return {"status": "ok", "user_id": str(user.id)}


@router.post("/internal/editions/{edition_id}/generate-pdf")
async def internal_generate_edition_pdf(
    edition_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_key),
):
    result = db.execute(
        select(Edition)
        .where(Edition.id == edition_id)
        .options(selectinload(Edition.items).selectinload(EditionItem.matter))
    )
    edition = result.scalar_one_or_none()
    if edition is None:
        raise HTTPException(404, "Edition not found")
    if edition.status != EditionStatus.CLOSED:
        raise HTTPException(
            422,
            f"Edition must be CLOSED to generate PDF, current: {edition.status.value}",
        )
    if edition.pdf_path:
        raise HTTPException(409, "PDF already generated for this edition")

    from app.services.edition_pdf import generate_edition_pdf_sync

    result = generate_edition_pdf_sync(edition_id=str(edition_id))
    edition.pdf_path = result["filename"]
    edition.pdf_hash = result["sha256"]
    edition.status = EditionStatus.PDF_GENERATED
    await db.commit()
    return result


@router.post("/internal/backup")
async def internal_create_backup(
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_key),
):
    from app.api.v1.backup import _run_backup, _get_backup_dir as _BD

    result = _run_backup()

    cleanup_result = await db.execute(
        select(SystemSetting).where(SystemSetting.key == "backup.retention_days")
    )
    ret_setting = cleanup_result.scalar_one_or_none()
    retention_days = 30
    if ret_setting and ret_setting.value:
        try:
            retention_days = int(ret_setting.value)
        except ValueError:
            pass

    import time
    now = time.time()
    cutoff = now - (retention_days * 86400)
    removed = 0
    for f in _BD().iterdir():
        if f.is_file() and f.suffix == ".gz" and f.stat().st_mtime < cutoff:
            f.unlink()
            removed += 1

    result["old_removed"] = removed
    return result


@router.get("/internal/settings")
async def internal_get_settings(
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_key),
):
    result = await db.execute(
        select(SystemSetting).where(SystemSetting.category == "backup")
    )
    settings_list = result.scalars().all()
    return {s.key: s.value for s in settings_list}


@router.post("/internal/backup/cleanup")
async def internal_cleanup_backups(
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_key),
):
    from app.api.v1.backup import _get_backup_dir as _BD

    result = await db.execute(
        select(SystemSetting).where(SystemSetting.key == "backup.retention_days")
    )
    setting = result.scalar_one_or_none()
    retention_days = 30
    if setting and setting.value:
        try:
            retention_days = int(setting.value)
        except ValueError:
            pass

    import time
    now = time.time()
    cutoff = now - (retention_days * 86400)
    removed = 0
    for f in _BD().iterdir():
        if f.is_file() and f.suffix == ".gz" and f.stat().st_mtime < cutoff:
            f.unlink()
            removed += 1

    return {"removed": removed, "retention_days": retention_days}
