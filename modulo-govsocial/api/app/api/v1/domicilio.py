import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_tenant_id, require_roles
from app.core.database import get_db
from app.models.domicilio import DadosDomicilio
from app.models.enums import RoleName
from app.models.user import User
from app.schemas.domicilio import DadosDomicilioCreate, DadosDomicilioOut

router = APIRouter(tags=["domicilio"])

_WRITE = require_roles(
    RoleName.TECNICO_SUPERIOR.value,
    RoleName.COORDENADOR_UNIDADE.value,
    RoleName.GESTOR_MUNICIPAL.value,
    RoleName.ADMIN.value,
)
_READ = require_roles(
    RoleName.TECNICO_SUPERIOR.value,
    RoleName.TECNICO_MEDIO.value,
    RoleName.COORDENADOR_UNIDADE.value,
    RoleName.GESTOR_MUNICIPAL.value,
    RoleName.VIGILANCIA.value,
    RoleName.RECEPCAO.value,
    RoleName.ADMIN.value,
)


@router.get("/families/{family_id}/domicilio", response_model=DadosDomicilioOut)
async def obter_domicilio(
    family_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    registro = (
        await db.execute(
            select(DadosDomicilio).where(
                DadosDomicilio.tenant_id == tenant_id,
                DadosDomicilio.family_id == family_id,
            )
        )
    ).scalar_one_or_none()
    if not registro:
        raise HTTPException(status_code=404, detail="Dados do domicilio nao encontrados")
    return registro


@router.patch("/families/{family_id}/domicilio", response_model=DadosDomicilioOut)
async def atualizar_domicilio(
    family_id: uuid.UUID,
    payload: DadosDomicilioCreate,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_WRITE),
):
    registro = (
        await db.execute(
            select(DadosDomicilio).where(
                DadosDomicilio.tenant_id == tenant_id,
                DadosDomicilio.family_id == family_id,
            )
        )
    ).scalar_one_or_none()

    if not registro:
        registro = DadosDomicilio(
            tenant_id=tenant_id,
            family_id=family_id,
        )
        db.add(registro)

    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(registro, key, value)

    await db.commit()
    await db.refresh(registro)
    return registro
