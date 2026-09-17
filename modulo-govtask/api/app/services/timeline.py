"""Linha do tempo imutável (§28, §43).

Eventos são append-only: nunca são editados nem apagados. Uma correção gera um
novo evento, de modo que o histórico permaneça auditável mesmo quando a
informação corrigida estiver errada.

O evento pertence a uma demanda (núcleo v2) e/ou a um convênio (entidades
anteriores à v2); ao menos um dos dois precisa ser informado.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import TipoEvento
from app.models.evento_timeline import EventoTimeline


async def registrar_evento(
    db: AsyncSession,
    tipo_evento: TipoEvento | str,
    ator_id: uuid.UUID,
    descricao: str,
    demanda_id: uuid.UUID | None = None,
    convenio_id: uuid.UUID | None = None,
    tarefa_id: uuid.UUID | None = None,
    metadados: dict | None = None,
    ocorrido_em: datetime | None = None,
) -> EventoTimeline:
    if demanda_id is None and convenio_id is None:
        raise ValueError("Evento de timeline exige demanda_id ou convenio_id")

    evento = EventoTimeline(
        demanda_id=demanda_id,
        convenio_id=convenio_id,
        tarefa_id=tarefa_id,
        tipo_evento=(
            tipo_evento.value if isinstance(tipo_evento, TipoEvento) else tipo_evento
        ),
        ator_id=ator_id,
        descricao=descricao,
        metadados=metadados,
        ocorrido_em=ocorrido_em or datetime.now(timezone.utc),
    )
    db.add(evento)
    await db.flush()
    # O dispatcher grava suas consequências na mesma transação: uma falha de
    # persistência não deixa a demanda alterada sem a automação correspondente.
    # Import tardio evita o ciclo timeline → automações → tarefas → timeline.
    if demanda_id is not None:
        from app.services.automacoes import executar_evento
        await executar_evento(db, evento)
    await _enfileirar_webhooks(db, evento, demanda_id, convenio_id)
    return evento


async def _enfileirar_webhooks(
    db: AsyncSession,
    evento: EventoTimeline,
    demanda_id: uuid.UUID | None,
    convenio_id: uuid.UUID | None,
) -> None:
    """Enfileira o evento para webhooks (§196), sem tocar na rede.

    Desligado por padrão (`WEBHOOKS_ENABLED`). Quando ligado, resolve a
    organização dona do processo e cria as entregas na mesma transação.
    """
    from app.core.config import settings

    if not settings.WEBHOOKS_ENABLED:
        return
    from app.models.convenio import Convenio
    from app.models.demanda import Demanda
    from app.services.webhooks import enfileirar_evento

    organization_id = None
    if demanda_id is not None:
        organization_id = (
            await db.execute(select(Demanda.organization_id).where(Demanda.id == demanda_id))
        ).scalar_one_or_none()
    elif convenio_id is not None:
        organization_id = (
            await db.execute(
                select(Convenio.organization_id).where(Convenio.id == convenio_id)
            )
        ).scalar_one_or_none()
    if organization_id is None:
        return
    await enfileirar_evento(
        db,
        organization_id=organization_id,
        evento=evento.tipo_evento,
        payload={
            "descricao": evento.descricao,
            "metadados": evento.metadados,
            "ocorrido_em": evento.ocorrido_em.isoformat() if evento.ocorrido_em else None,
        },
        demanda_id=demanda_id,
    )
