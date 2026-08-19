import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin

if TYPE_CHECKING:
    from app.models.tarefa import Tarefa
    from app.models.user import User


class TarefaPrazoHistorico(Base, TimestampMixin, SoftDeleteMixin):
    """Registra cada definição/alteração de prazo de uma tarefa (append-only)."""

    __tablename__ = "tarefas_prazos_historico"

    tarefa_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tarefas.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    prazo_anterior: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    prazo_novo: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    definido_por_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    motivo: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tipo: Mapped[str] = mapped_column(
        String(20), nullable=False, default="PRORROGACAO",
        comment="DEFINICAO ou PRORROGACAO",
    )

    tarefa: Mapped["Tarefa"] = relationship("Tarefa", back_populates="historico_prazos")
    definido_por: Mapped["User"] = relationship("User", foreign_keys=[definido_por_id])

    def __repr__(self) -> str:
        return f"<TarefaPrazoHistorico {self.prazo_novo} por {self.definido_por_id}>"
