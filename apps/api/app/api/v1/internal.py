import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import require_internal_key
from app.core.database import get_db
from app.models.edition import Edition
from app.models.edition_item import EditionItem
from app.models.enums import EditionStatus
from app.models.setting import SystemSetting

router = APIRouter()


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
    from app.models.organization import Organization

    org_result = await db.execute(
        select(Organization).where(Organization.id == edition.organization_id)
    )
    organization = org_result.scalar_one_or_none()
    pdf_layout = organization.pdf_layout if organization else "classico"

    result = generate_edition_pdf_sync(edition_id=str(edition_id), layout=pdf_layout)
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
