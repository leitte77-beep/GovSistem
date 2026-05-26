"""Legacy collection import endpoints: batch upload, CSV import, validation."""


from fastapi import APIRouter, Depends, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import require_roles
from app.core.database import get_db
from app.models.user import User
from app.schemas.legacy_import import LegacyImportResponse
from app.services.legacy_importer import (
    LegacyImportItem,
    import_items,
    parse_csv,
    validate_items,
)

router = APIRouter(tags=["legacy"])


@router.post("/legacy/validate", response_model=LegacyImportResponse)
async def legacy_validate(
    files: list[UploadFile],
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ADMIN")),
):
    items = []
    for f in files:
        content = await f.read()
        items.append(LegacyImportItem(f.filename or "unknown", content))

    result = await validate_items(items, user.organization_id, db)
    return LegacyImportResponse(
        total=result.total,
        success=result.success,
        errors=result.errors,
        editions_created=[],
        message=f"{result.success} of {result.total} files valid",
    )


@router.post("/legacy/import", response_model=LegacyImportResponse)
async def legacy_import(
    files: list[UploadFile],
    description: str = "",
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ADMIN")),
):
    items = []
    for f in files:
        content = await f.read()
        items.append(LegacyImportItem(f.filename or "unknown", content))

    result = await import_items(items, user.organization_id, user.id, description, db)
    return LegacyImportResponse(
        total=result.total,
        success=result.success,
        errors=result.errors,
        editions_created=result.editions_created,
        message=f"{result.success} editions imported, {len(result.errors)} errors",
    )


@router.post("/legacy/import-csv", response_model=LegacyImportResponse)
async def legacy_import_csv(
    file: UploadFile,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ADMIN")),
):
    content = (await file.read()).decode("utf-8", errors="replace")
    rows = parse_csv(content)

    items = []
    for row in rows:
        try:
            year = int(row.get("ano", 0))
            number = int(row.get("numero", 0))
            desc = row.get("descricao", "")
            fname = row.get("arquivo", "")

            item = LegacyImportItem(fname, b"")
            item.edition_year = year
            item.edition_number = number
            item.description = desc
            items.append(item)
        except (ValueError, KeyError) as e:
            return LegacyImportResponse(
                total=len(rows), success=0,
                errors=[{"file": row.get("arquivo", ""), "error": str(e)}],
                editions_created=[], message="CSV parsing failed",
            )

    result = await import_items(items, user.organization_id, user.id, db)
    return LegacyImportResponse(
        total=result.total,
        success=result.success,
        errors=result.errors,
        editions_created=result.editions_created,
        message=f"{result.success} editions imported from CSV",
    )
