import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user, require_roles
from app.core.database import get_db
from app.core.permissions import require_permission
from app.document_model.layout import DocumentLayout
from app.middleware.audit import capture_request_info, log_audit_event
from app.models.enums import AuditAction
from app.models.organization import Organization
from app.models.setting import SystemSetting
from app.models.user import User
from app.schemas.institution import InstitutionalProfileOut, InstitutionalProfileUpdate
from app.schemas.setting import SettingCreate, SettingOut, SettingUpdate
from app.services.edition_pdf import AVAILABLE_LAYOUTS

router = APIRouter(tags=["settings"])


def _institution_out(org: Organization) -> InstitutionalProfileOut:
    return InstitutionalProfileOut(
        name=org.name,
        slug=org.slug,
        cnpj=org.cnpj,
        state=org.state,
        address_street=org.address_street,
        address_number=org.address_number,
        address_complement=org.address_complement,
        address_district=org.address_district,
        address_city=org.address_city,
        address_postal_code=org.address_postal_code,
        phone=org.phone,
        email=org.email,
        site=org.site,
        logo_url=org.logo_url,
        institutional_layout=org.institutional_layout,
    )


# ── Identidade institucional (cabeçalho/rodapé dos documentos) ──────────────
# Declarado antes de /settings/{setting_id} para não ser capturado pela rota CRUD.


@router.get("/settings/institution", response_model=InstitutionalProfileOut)
async def get_institution(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission("settings.manage", "document_model.view")),
):
    result = await db.execute(select(Organization).where(Organization.id == user.organization_id))
    org = result.scalar_one_or_none()
    if org is None:
        raise HTTPException(404, "Organization not found")
    return _institution_out(org)


@router.patch("/settings/institution", response_model=InstitutionalProfileOut)
async def update_institution(
    body: InstitutionalProfileUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission("settings.manage")),
):
    result = await db.execute(select(Organization).where(Organization.id == user.organization_id))
    org = result.scalar_one_or_none()
    if org is None:
        raise HTTPException(404, "Organization not found")

    data = body.model_dump(exclude_unset=True)
    if "institutional_layout" in data and data["institutional_layout"] is not None:
        try:
            data["institutional_layout"] = DocumentLayout.model_validate(
                data["institutional_layout"]
            ).model_dump(mode="json")
        except ValueError as exc:
            raise HTTPException(422, f"Layout institucional inválido: {exc}") from exc

    for field, value in data.items():
        setattr(org, field, value)

    info = await capture_request_info(request)
    await log_audit_event(
        db,
        action=AuditAction.INSTITUTIONAL_PROFILE_UPDATED,
        user_id=user.id,
        organization_id=org.id,
        entity_type="organization",
        entity_id=org.id,
        description="Identidade institucional atualizada",
        extra_metadata={"fields": sorted(data.keys())},
        ip_address=info.get("ip_address"),
    )
    await db.commit()
    await db.refresh(org)
    return _institution_out(org)


# ── PDF Layout ─────────────────────────────────────────────────────────────
# Must come BEFORE /settings/{setting_id} routes to avoid path conflicts


@router.get("/settings/pdf-layouts")
async def list_pdf_layouts():
    """List available PDF layout templates."""
    return {
        "layouts": [
            {
                "id": "classico",
                "name": "Clássico",
                "description": "Estilo tradicional de diário oficial — brasão centralizado, faixas cinza, tipografia serifada. Ideal para órgãos que seguem o padrão governamental clássico.",
            },
            {
                "id": "moderno",
                "name": "Moderno",
                "description": "Design limpo com linhas azuis, cantos arredondados, tipografia sans-serif. Ideal para órgãos que querem uma apresentação mais contemporânea.",
            },
            {
                "id": "minimalista",
                "name": "Minimalista",
                "description": "Preto e branco com linhas finas e sem decorações. Máxima economia de tinta e espaço. Ideal para órgãos que priorizam simplicidade.",
            },
        ],
        "current": None,
    }


@router.get("/settings/organization/pdf-layout")
async def get_org_pdf_layout(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
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


# ── System Settings CRUD ──────────────────────────────────────────────────


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
