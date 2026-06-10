import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.models.base import Base, TimestampMixin
from app.models.enums import TipoEvento

if TYPE_CHECKING:
    from app.models.convenio import Convenio
    from app.models.tarefa import Tarefa
    from app.models.user import User


class EventoTimeline(Base, TimestampMixin):
    """Registro imutável de eventos na linha do tempo. Append-only: nunca editar/apagar."""
    __tablename__ = "eventos_timeline"

    convenio_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("convenios.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    tarefa_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tarefas.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    tipo_evento: Mapped[TipoEvento] = mapped_column(
        String(50), nullable=False, index=True
    )
    ator_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    descricao: Mapped[str] = mapped_column(Text, nullable=False)
    metadados: Mapped[Optional[dict]] = mapped_column(
        JSON, nullable=True,
        comment="Dados adicionais do evento (ex: status anterior, novo status)"
    )
    ocorrido_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.now,
        comment="Momento exato em que o evento ocorreu"
    )

    # Relationships
    convenio: Mapped["Convenio"] = relationship("Convenio", back_populates="eventos")
    tarefa: Mapped[Optional["Tarefa"]] = relationship("Tarefa", back_populates="eventos")
    ator: Mapped["User"] = relationship("User")

    def __repr__(self) -> str:
        return f"<Evento {self.tipo_evento.value} em {self.ocorrido_em}>"
