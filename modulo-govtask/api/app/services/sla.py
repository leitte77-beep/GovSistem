"""SLA interno (§152–§154).

Resolve a meta aplicável (a mais específica vence: prioridade > setor > tipo >
global), calcula o vencimento com o calendário do município e classifica a
demanda em dentro, próximo ou vencido. É indicador de gestão — nunca se
confunde com o prazo legal, que é outro campo e outra origem.
"""

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.demanda import Demanda
from app.models.enums import TipoContagemSla
from app.models.sla import SlaConfig
from app.services.calendario import carregar_calendario

JANELA_ATENCAO = timedelta(hours=24)


def _especificidade(config: SlaConfig) -> int:
    """Quanto mais eixos preenchidos, mais específica é a regra."""
    return sum(
        1
        for valor in (config.tipo_demanda_id, config.setor_id, config.prioridade)
        if valor is not None
    )


async def resolver_config(
    db: AsyncSession,
    organization_id: uuid.UUID,
    *,
    tipo_demanda_id: uuid.UUID | None = None,
    setor_id: uuid.UUID | None = None,
    prioridade: str | None = None,
) -> SlaConfig | None:
    """Escolhe a regra mais específica que casa com a demanda."""
    candidatas = (
        (
            await db.execute(
                select(SlaConfig).where(
                    SlaConfig.organization_id == organization_id,
                    SlaConfig.ativo.is_(True),
                    SlaConfig.deleted_at.is_(None),
                    or_(
                        SlaConfig.tipo_demanda_id.is_(None),
                        SlaConfig.tipo_demanda_id == tipo_demanda_id,
                    ),
                    or_(
                        SlaConfig.setor_id.is_(None),
                        SlaConfig.setor_id == setor_id,
                    ),
                    or_(
                        SlaConfig.prioridade.is_(None),
                        SlaConfig.prioridade == prioridade,
                    ),
                )
            )
        )
        .scalars()
        .all()
    )
    if not candidatas:
        return None
    return max(candidatas, key=_especificidade)


async def calcular_para_demanda(
    db: AsyncSession, demanda: Demanda
) -> dict | None:
    """Vencimento do SLA e situação atual. `None` quando não há meta configurada."""
    config = await resolver_config(
        db,
        demanda.organization_id,
        tipo_demanda_id=demanda.tipo_id,
        setor_id=demanda.setor_atual_id,
        prioridade=demanda.prioridade.value if hasattr(demanda.prioridade, "value") else demanda.prioridade,
    )
    if config is None:
        return None
    calendario = await carregar_calendario(db, demanda.organization_id)
    return calcular_com_config(config, demanda, calendario)


def escolher_config(
    configs: list[SlaConfig],
    *,
    tipo_demanda_id: uuid.UUID | None,
    setor_id: uuid.UUID | None,
    prioridade: str | None,
) -> SlaConfig | None:
    """Mesma regra de `resolver_config`, mas em memória — para o painel."""
    casam = [
        c
        for c in configs
        if (c.tipo_demanda_id is None or c.tipo_demanda_id == tipo_demanda_id)
        and (c.setor_id is None or c.setor_id == setor_id)
        and (c.prioridade is None or c.prioridade == prioridade)
    ]
    return max(casam, key=_especificidade) if casam else None


def calcular_com_config(
    config: SlaConfig, demanda: Demanda, calendario
) -> dict:
    """Calcula vencimento e situação de uma demanda para uma config já resolvida."""
    base = demanda.created_at
    if base.tzinfo is None:
        base = base.replace(tzinfo=timezone.utc)

    if config.contagem == TipoContagemSla.HORAS.value:
        vencimento = base + timedelta(hours=config.valor)
    else:
        vencimento = calendario.prazo(base, config.valor, config.contagem)

    agora = datetime.now(timezone.utc)
    if demanda.encerrada:
        situacao = "ENCERRADA"
    elif agora > vencimento:
        situacao = "VENCIDO"
    elif vencimento - agora <= JANELA_ATENCAO:
        situacao = "PROXIMO"
    else:
        situacao = "DENTRO"
    return {
        "config_id": str(config.id),
        "valor": config.valor,
        "contagem": config.contagem,
        "vencimento": vencimento,
        "situacao": situacao,
        "horas_restantes": round((vencimento - agora).total_seconds() / 3600, 1),
    }
