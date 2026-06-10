"""Records timeline events (append-only)."""

from datetime import datetime, timezone
from typing import Optional
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import TipoEvento
from app.models.evento_timeline import EventoTimeline


async def registrar_evento(
    db: AsyncSession,
    convenio_id: uuid.UUID,
    tipo_evento: TipoEvento,
    ator_id: uuid.UUID,
    descricao: str,
    tarefa_id: uuid.UUID | None = None,
    metadados: dict | None = None,
    ocorrido_em: datetime | None = None,
) -> EventoTimeline:
    """Registra um evento na linha do tempo. Append-only — nunca editar/apagar."""
    evento = EventoTimeline(
        convenio_id=convenio_id,
        tarefa_id=tarefa_id,
        tipo_evento=tipo_evento,
        ator_id=ator_id,
        descricao=descricao,
        metadados=metadados,
        ocorrido_em=ocorrido_em or datetime.now(timezone.utc),
    )
    db.add(evento)
    await db.flush()
    return evento
