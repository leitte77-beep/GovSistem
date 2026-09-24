import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user, require_roles
from app.core.database import get_db
from app.models.setting import SystemSetting
from app.models.user import User
from app.schemas.setting import SettingCreate, SettingOut, SettingUpdate

router = APIRouter(
    tags=["settings"], dependencies=[Depends(require_roles("ADMIN"))]
)


@router.get("/settings", response_model=list[SettingOut])
async def list_settings(
    category: str | None = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles("ADMIN")),
):
    query = select(SystemSetting).order_by(SystemSetting.category, SystemSetting.key)
    if category:
        query = query.where(SystemSetting.category == category)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/settings/{setting_id}", response_model=SettingOut)
async def get_setting(
    setting_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles("ADMIN")),
):
    result = await db.execute(
        select(SystemSetting).where(SystemSetting.id == setting_id)
    )
    setting = result.scalar_one_or_none()
    if setting is None:
        raise HTTPException(status_code=404, detail="Setting not found")
    return setting


@router.post("/settings", response_model=SettingOut, status_code=201)
async def create_setting(
    body: SettingCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles("ADMIN")),
):
    existing = await db.execute(
        select(SystemSetting).where(SystemSetting.key == body.key)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Setting key already exists")

    setting = SystemSetting(
        key=body.key,
        value=body.value,
        description=body.description,
        category=body.category,
        type=body.type,
        is_encrypted=body.is_encrypted,
        is_public=body.is_public,
    )
    db.add(setting)
    await db.commit()
    await db.refresh(setting)
    return setting


@router.patch("/settings/{setting_id}", response_model=SettingOut)
async def update_setting(
    setting_id: uuid.UUID,
    body: SettingUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles("ADMIN")),
):
    result = await db.execute(
        select(SystemSetting).where(SystemSetting.id == setting_id)
    )
    setting = result.scalar_one_or_none()
    if setting is None:
        raise HTTPException(status_code=404, detail="Setting not found")

    if body.value is not None:
        setting.value = body.value
    if body.description is not None:
        setting.description = body.description

    await db.commit()
    await db.refresh(setting)
    return setting


@router.delete("/settings/{setting_id}", status_code=204)
async def delete_setting(
    setting_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles("ADMIN")),
):
    result = await db.execute(
        select(SystemSetting).where(SystemSetting.id == setting_id)
    )
    setting = result.scalar_one_or_none()
    if setting is None:
        raise HTTPException(status_code=404, detail="Setting not found")
    await db.delete(setting)
    await db.commit()

# ── PDF Layout ─────────────────────────────────────────────────────────────

from app.services.edition_pdf import AVAILABLE_LAYOUTS

@router.get("/settings/pdf-layouts")
async def list_pdf_layouts():
    """List available PDF layout templates."""
    return {
        "layouts": [
            {
                "id": "classico",
                "name": "Clássico",
                "description": "Estilo tradicional de diário oficial — brasão centralizado, faixas cinza, tipografia serifada.",
            },
            {
                "id": "moderno",
                "name": "Moderno",
                "description": "Design limpo com linhas azuis, cantos arredondados, tipografia sans-serif.",
            },
            {
                "id": "minimalista",
                "name": "Minimalista",
                "description": "Preto e branco com linhas finas, sem decorações. Máxima economia de tinta.",
            },
        ],
    }


@router.get("/settings/organization/pdf-layout")
async def get_org_pdf_layout(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from app.models.organization import Organization
    org_result = await db.execute(
        select(Organization).where(Organization.id == user.organization_id)
    )
    org = org_result.scalar_one_or_none()
    if not org:
        raise HTTPException(404, "Organization not found")
    return {"layout": org.pdf_layout, "available": AVAILABLE_LAYOUTS}


@router.patch("/settings/organization/pdf-layout")
async def update_org_pdf_layout(
    body: dict,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ADMIN")),
):
    from app.models.organization import Organization
    layout = body.get("layout", "")
    if layout not in AVAILABLE_LAYOUTS:
        raise HTTPException(
            422,
            f"Invalid layout. Available: {', '.join(AVAILABLE_LAYOUTS)}",
        )

    org_result = await db.execute(
        select(Organization).where(Organization.id == user.organization_id)
    )
    org = org_result.scalar_one_or_none()
    if not org:
        raise HTTPException(404, "Organization not found")

    org.pdf_layout = layout
    await db.commit()
    return {"layout": org.pdf_layout, "message": f"PDF layout updated to '{layout}'"}
