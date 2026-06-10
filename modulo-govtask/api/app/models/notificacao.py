import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.models.enums import CanalNotificacao, TipoNotificacao

if TYPE_CHECKING:
    from app.models.convenio import Convenio
    from app.models.tarefa import Tarefa
    from app.models.user import User


class Notificacao(Base, TimestampMixin):
    __tablename__ = "notificacoes"

    destinatario_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    tipo: Mapped[TipoNotificacao] = mapped_column(
        String(30), nullable=False, index=True
    )
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
    mensagem: Mapped[str] = mapped_column(Text, nullable=False)
    canal: Mapped[CanalNotificacao] = mapped_column(
        String(10), nullable=False, default=CanalNotificacao.IN_APP
    )
    lida: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    lida_em: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    destinatario: Mapped["User"] = relationship("User", foreign_keys=[destinatario_id])
    convenio: Mapped["Convenio"] = relationship("Convenio", back_populates="notificacoes")
    tarefa: Mapped[Optional["Tarefa"]] = relationship(
        "Tarefa", back_populates="notificacoes"
    )

    def __repr__(self) -> str:
        return f"<Notificacao {self.tipo.value} para {self.destinatario_id}>"
