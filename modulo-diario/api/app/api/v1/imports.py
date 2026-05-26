from fastapi import APIRouter, Depends, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import require_roles
from app.core.database import get_db
from app.models.user import User
from app.schemas.imports import ImportResponse
from app.services.importer import import_csv, import_docx, import_pdf, import_xlsx

router = APIRouter(tags=["imports"])


@router.post("/imports/docx", response_model=ImportResponse)
async def upload_docx(
    file: UploadFile,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("AUTOR", "ADMIN")),
):
    result = await import_docx(file, db, user.id, user.organization_id)
    await db.commit()
    return result


@router.post("/imports/xlsx", response_model=ImportResponse)
async def upload_xlsx(
    file: UploadFile,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("AUTOR", "ADMIN")),
):
    result = await import_xlsx(file, db, user.id, user.organization_id)
    await db.commit()
    return result


@router.post("/imports/csv", response_model=ImportResponse)
async def upload_csv(
    file: UploadFile,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("AUTOR", "ADMIN")),
):
    result = await import_csv(file, db, user.id, user.organization_id)
    await db.commit()
    return result


@router.post("/imports/pdf", response_model=ImportResponse)
async def upload_pdf(
    file: UploadFile,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("AUTOR", "ADMIN")),
):
    result = await import_pdf(file, db, user.id, user.organization_id)
    await db.commit()
    return result
