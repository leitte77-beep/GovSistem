import uuid
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin

if TYPE_CHECKING:
    from app.models.tarefa import Tarefa
    from app.models.user import User


class Comentario(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "comentarios"

    tarefa_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tarefas.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    autor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    texto: Mapped[str] = mapped_column(Text, nullable=False)

    # Relationships
    tarefa: Mapped["Tarefa"] = relationship("Tarefa", back_populates="comentarios")
    autor: Mapped["User"] = relationship("User")

    def __repr__(self) -> str:
        return f"<Comentario por {self.autor_id}>"
