import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_tenant_id, require_roles
from app.core.database import get_db
from app.models.enums import RoleName
from app.models.user import User
from app.services import vigilancia_avancada as svc

router = APIRouter(tags=["vigilancia-avancada"])

_READ = require_roles(
    RoleName.GESTOR_MUNICIPAL.value,
    RoleName.VIGILANCIA.value,
    RoleName.COORDENADOR_UNIDADE.value,
    RoleName.ADMIN.value,
)


@router.get("/vigilancia/indicadores-territorio")
async def indicadores_territorio(
    mes: int = Query(..., ge=1, le=12),
    ano: int = Query(..., ge=2000, le=2100),
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    return await svc.calcular_indicadores_territorio(db, tenant_id, mes, ano)


@router.get("/vigilancia/tendencias")
async def tendencias(
    meses: int = Query(12, ge=3, le=36),
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    return await svc.calcular_tendencias(db, tenant_id, meses)


@router.get("/vigilancia/mapa-calor")
async def mapa_calor(
    tipo: str = Query("vulnerabilidade", regex="^(vulnerabilidade|densidade)$"),
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    return await svc.calcular_mapa_calor(db, tenant_id, tipo)


@router.get("/vigilancia/perfil-populacional")
async def perfil_populacional(
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    return await svc.calcular_perfil_populacional(db, tenant_id)


@router.get("/vigilancia/anomalias")
async def anomalias(
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    return await svc.detectar_anomalias(db, tenant_id)
