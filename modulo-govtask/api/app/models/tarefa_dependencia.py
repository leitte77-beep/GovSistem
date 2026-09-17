import uuid
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.tarefa import Tarefa


class TarefaDependencia(Base):
    __tablename__ = "tarefas_dependencias"
    __table_args__ = (
        UniqueConstraint("tarefa_id", "depende_de_id", name="uq_tarefa_dependencia"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tarefa_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tarefas.id", ondelete="CASCADE"), nullable=False, index=True,
        comment="Tarefa que fica bloqueada",
    )
    depende_de_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tarefas.id", ondelete="CASCADE"), nullable=False,
        comment="Tarefa que deve ser concluída antes",
    )

    tarefa: Mapped["Tarefa"] = relationship(
        "Tarefa", foreign_keys=[tarefa_id], back_populates="dependencias"
    )
    depende_de: Mapped["Tarefa"] = relationship(
        "Tarefa", foreign_keys=[depende_de_id], back_populates="dependentes"
    )

    def __repr__(self) -> str:
        return f"<TarefaDependencia {self.tarefa_id} <- {self.depende_de_id}>"
