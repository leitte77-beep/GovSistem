import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin
from app.models.enums import StatusContestacao

if TYPE_CHECKING:
    from app.models.tarefa import Tarefa
    from app.models.user import User


class Contestacao(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "contestacoes"

    tarefa_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tarefas.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    solicitado_por_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    motivo: Mapped[str] = mapped_column(Text, nullable=False)
    novo_prazo_solicitado: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    status: Mapped[StatusContestacao] = mapped_column(
        String(20), nullable=False, default=StatusContestacao.PENDENTE
    )
    decidido_por_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    justificativa_decisao: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True
    )
    data_decisao: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    tarefa: Mapped["Tarefa"] = relationship("Tarefa", back_populates="contestacoes")
    solicitado_por: Mapped["User"] = relationship(
        "User", foreign_keys=[solicitado_por_id]
    )
    decidido_por: Mapped[Optional["User"]] = relationship(
        "User", foreign_keys=[decidido_por_id]
    )

    def __repr__(self) -> str:
        return f"<Contestacao tarefa={self.tarefa_id} [{self.status.value}]>"
