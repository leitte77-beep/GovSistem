import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_tenant_id, require_roles
from app.core.database import get_db
from app.models.enums import RoleName
from app.models.user import User
from app.schemas.dashboard import (
    BenefitReportItem,
    DashboardActivityItem,
    DashboardOverviewOut,
    IndicatorsOut,
    MapItem,
    TerritoryItem,
    TimeSeriesItem,
)
from app.services.dashboard import (
    get_activity,
    get_benefits_report,
    get_by_territory,
    get_indicators,
    get_map_data,
    get_overview,
    get_time_series,
)

router = APIRouter(tags=["dashboard"])

_READ = require_roles(
    RoleName.GESTOR_MUNICIPAL.value,
    RoleName.VIGILANCIA.value,
    RoleName.COORDENADOR_UNIDADE.value,
    RoleName.ADMIN.value,
)


@router.get("/dashboard/overview", response_model=DashboardOverviewOut)
async def dashboard_overview(
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    return await get_overview(db, tenant_id)


@router.get("/dashboard/time-series", response_model=list[TimeSeriesItem])
async def dashboard_time_series(
    meses: int = Query(12, ge=1, le=24),
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    return await get_time_series(db, tenant_id, meses)


@router.get("/dashboard/by-territory", response_model=list[TerritoryItem])
async def dashboard_territory(
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    return await get_by_territory(db, tenant_id)


@router.get("/dashboard/map", response_model=list[MapItem])
async def dashboard_map(
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    return await get_map_data(db, tenant_id)


@router.get("/dashboard/benefits-report", response_model=list[BenefitReportItem])
async def dashboard_benefits_report(
    ano: int | None = Query(None),
    mes: int | None = Query(None, ge=1, le=12),
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    return await get_benefits_report(db, tenant_id, ano, mes)


@router.get("/dashboard/indicators", response_model=IndicatorsOut)
async def dashboard_indicators(
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    return await get_indicators(db, tenant_id)


@router.get("/dashboard/activity", response_model=list[DashboardActivityItem])
async def dashboard_activity(
    limit: int = Query(10, ge=1, le=30),
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    return await get_activity(db, tenant_id, limit)
