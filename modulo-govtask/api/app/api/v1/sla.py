"""SLA interno (§152–§154): configuração, consulta por demanda e painel.

O painel classifica as demandas abertas em dentro/próximo/vencido. É indicador
de gestão: nunca é usado como avaliação disciplinar automática de servidores.
"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_user_permissions, require_permission
from app.core.database import get_db
from app.core.permissions import Perm
from app.models.catalogo import TipoDemanda
from app.models.demanda import Demanda
from app.models.sla import SlaConfig
from app.models.user import User
from app.schemas.gestao_avancada import (
    SlaConfigCreate,
    SlaConfigOut,
    SlaConfigUpdate,
    SlaDemandaOut,
)
from app.services import demandas as svc_demanda
from app.services import sla as svc_sla
from app.services.calendario import carregar_calendario

router = APIRouter(prefix="/sla", tags=["SLA interno"])
router_demanda = APIRouter(prefix="/demandas", tags=["SLA interno"])


async def _config_ou_404(
    db: AsyncSession, config_id: uuid.UUID, organization_id: uuid.UUID
) -> SlaConfig:
    config = (
        await db.execute(
            select(SlaConfig).where(
                SlaConfig.id == config_id,
                SlaConfig.organization_id == organization_id,
                SlaConfig.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if config is None:
        raise HTTPException(status_code=404, detail="Configuração de SLA não encontrada")
    return config


@router.get("/config", response_model=list[SlaConfigOut])
async def listar_config(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    itens = (
        (
            await db.execute(
                select(SlaConfig).where(
                    SlaConfig.organization_id == user.organization_id,
                    SlaConfig.deleted_at.is_(None),
                )
            )
        )
        .scalars()
        .all()
    )
    return [SlaConfigOut.model_validate(i) for i in itens]


@router.post("/config", response_model=SlaConfigOut, status_code=status.HTTP_201_CREATED)
async def criar_config(
    payload: SlaConfigCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.ADMIN_CONFIG)),
):
    dados = payload.model_dump()
    if dados.get("tipo_demanda_id") is not None:
        await svc_demanda.resolver_catalogo(
            db,
            TipoDemanda,
            dados["tipo_demanda_id"],
            user.organization_id,
            "Tipo de demanda",
        )
    config = SlaConfig(organization_id=user.organization_id, **dados)
    db.add(config)
    await db.commit()
    await db.refresh(config)
    return SlaConfigOut.model_validate(config)


@router.patch("/config/{config_id}", response_model=SlaConfigOut)
async def atualizar_config(
    config_id: uuid.UUID,
    payload: SlaConfigUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.ADMIN_CONFIG)),
):
    config = await _config_ou_404(db, config_id, user.organization_id)
    for campo, valor in payload.model_dump(exclude_unset=True).items():
        setattr(config, campo, valor)
    await db.commit()
    await db.refresh(config)
    return SlaConfigOut.model_validate(config)


@router.delete("/config/{config_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remover_config(
    config_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.ADMIN_CONFIG)),
):
    config = await _config_ou_404(db, config_id, user.organization_id)
    config.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/painel")
async def painel_sla(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    permitido = get_user_permissions(user)
    stmt = svc_demanda.aplicar_escopo(
        select(Demanda).where(Demanda.concluida_em.is_(None)), user, permitido
    ).limit(2000)
    demandas = (await db.execute(stmt)).scalars().all()

    configs = (
        (
            await db.execute(
                select(SlaConfig).where(
                    SlaConfig.organization_id == user.organization_id,
                    SlaConfig.ativo.is_(True),
                    SlaConfig.deleted_at.is_(None),
                )
            )
        )
        .scalars()
        .all()
    )
    calendario = await carregar_calendario(db, user.organization_id)

    resumo = {"DENTRO": 0, "PROXIMO": 0, "VENCIDO": 0, "SEM_META": 0}
    por_setor: dict[str, dict[str, int]] = {}
    atrasadas: list[dict] = []
    for demanda in demandas:
        prioridade = (
            demanda.prioridade.value if hasattr(demanda.prioridade, "value") else demanda.prioridade
        )
        config = svc_sla.escolher_config(
            list(configs),
            tipo_demanda_id=demanda.tipo_id,
            setor_id=demanda.setor_atual_id,
            prioridade=prioridade,
        )
        if config is None:
            resumo["SEM_META"] += 1
            continue
        calculo = svc_sla.calcular_com_config(config, demanda, calendario)
        resumo[calculo["situacao"]] = resumo.get(calculo["situacao"], 0) + 1
        setor = demanda.setor_atual.nome if demanda.setor_atual else "Sem setor"
        por_setor.setdefault(setor, {"DENTRO": 0, "PROXIMO": 0, "VENCIDO": 0})
        por_setor[setor][calculo["situacao"]] = (
            por_setor[setor].get(calculo["situacao"], 0) + 1
        )
        if calculo["situacao"] == "VENCIDO" and len(atrasadas) < 100:
            atrasadas.append(
                {
                    "demanda_id": str(demanda.id),
                    "numero": demanda.numero,
                    "titulo": demanda.titulo,
                    "setor": setor,
                    "vencimento": calculo["vencimento"],
                    "horas_restantes": calculo["horas_restantes"],
                }
            )
    return {
        "resumo": resumo,
        "por_setor": por_setor,
        "vencidas": sorted(atrasadas, key=lambda x: x["horas_restantes"]),
    }


# ── SLA de uma demanda ──────────────────────────────────────────────────────

@router_demanda.get("/{demanda_id}/sla", response_model=SlaDemandaOut | None)
async def sla_da_demanda(
    demanda_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    demanda = await svc_demanda.get_demanda_ou_404(
        db, demanda_id, user, get_user_permissions(user)
    )
    calculo = await svc_sla.calcular_para_demanda(db, demanda)
    if calculo is None:
        return None
    return SlaDemandaOut(**calculo)
