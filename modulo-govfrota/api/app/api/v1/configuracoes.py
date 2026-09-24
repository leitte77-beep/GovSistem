import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user, require_permission
from app.core.database import get_db
from app.core.permissions import Perm
from app.models.auth_models import User
from app.models.configuracoes import ConfiguracaoGovFrota
from app.schemas.schemas import ConfiguracaoResponse, ConfiguracaoUpdate
from app.services.auditoria import registrar_auditoria

router = APIRouter(prefix="/configuracoes", tags=["configurações"])


async def _get_config(db: AsyncSession, organization_id: uuid.UUID) -> ConfiguracaoGovFrota:
    result = await db.execute(
        select(ConfiguracaoGovFrota).where(
            ConfiguracaoGovFrota.organization_id == organization_id
        )
    )
    config = result.scalar_one_or_none()
    if config is None:
        config = ConfiguracaoGovFrota(organization_id=organization_id)
        db.add(config)
        await db.flush()
    return config


@router.get("", response_model=ConfiguracaoResponse)
async def obter(
    user: User = Depends(require_permission(Perm.VEHICLE_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    return await _get_config(db, user.organization_id)


@router.patch("", response_model=ConfiguracaoResponse)
async def atualizar(
    body: ConfiguracaoUpdate,
    user: User = Depends(require_permission(Perm.CONFIG_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    config = await _get_config(db, user.organization_id)
    dados = body.model_dump(exclude_unset=True)
    if dados.get("tipo_organizacao") not in (None, "PUBLICO", "PRIVADO"):
        from fastapi import HTTPException

        raise HTTPException(status_code=422, detail="Tipo de organização inválido.")
    for campo, valor in dados.items():
        setattr(config, campo, valor)
    await registrar_auditoria(
        db,
        organization_id=user.organization_id,
        acao="configuracoes.atualizar",
        entidade="configuracoes",
        usuario_id=user.id,
        dados_novos=dados,
    )
    await db.commit()
    await db.refresh(config)
    return config
