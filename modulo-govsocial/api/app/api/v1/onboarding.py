import uuid

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import (
    get_client_info,
    get_current_user,
    get_tenant_id,
    require_roles,
)
from app.core.database import get_db
from app.models.enums import AuditAction, RoleName
from app.models.organization import Organization
from app.models.user import User
from app.schemas.onboarding import (
    OrganizationConfigOut,
    SystemHealthOut,
    SystemMetricsOut,
    TenantOnboardingStatus,
    WizardStepRequest,
)
from app.services.audit import record_audit
from app.services.onboarding import execute_wizard_setup, get_tenant_setup_status
from app.services.system_health import get_system_health, get_system_metrics

router = APIRouter(tags=["onboarding"])

_WIZARD = require_roles(
    RoleName.GESTOR_MUNICIPAL.value,
    RoleName.ADMIN.value,
)
_ADMIN_ONLY = require_roles(RoleName.ADMIN.value)


@router.get("/onboarding/status", response_model=TenantOnboardingStatus)
async def onboarding_status(
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_WIZARD),
):
    result = await get_tenant_setup_status(db, tenant_id)
    return result


@router.post("/onboarding/wizard/{step}")
async def onboarding_wizard_step(
    step: str,
    body: WizardStepRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_WIZARD),
):
    result = await execute_wizard_setup(db, tenant_id, step, body.data)
    await record_audit(
        db,
        tenant_id=tenant_id,
        action=AuditAction.UPDATE,
        entity="onboarding_wizard",
        entity_id=tenant_id,
        actor=user,
        client_info=get_client_info(request),
        diff_summary={"step": step, "result": result},
    )
    await db.commit()
    return result


@router.get("/system/health", response_model=SystemHealthOut)
async def system_health(
    db: AsyncSession = Depends(get_db),
):
    return await get_system_health(db)


@router.get("/system/metrics", response_model=SystemMetricsOut)
async def system_metrics(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_ADMIN_ONLY),
):
    return await get_system_metrics(db)


@router.get("/organizations/config", response_model=OrganizationConfigOut)
async def organization_config(
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(get_current_user),
):
    org = await db.get(Organization, tenant_id)
    theme = org.theme_config if org and org.theme_config else {}
    return OrganizationConfigOut(
        nome_municipio=org.name if org else "",
        brasao_url=org.brasao_url if org else None,
        cor_destaque=theme.get("cor_destaque") if theme else None,
    )
