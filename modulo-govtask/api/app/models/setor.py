from typing import Optional

import uuid

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, SoftDeleteMixin, TimestampMixin


class Setor(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "setores"

    organization_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=True, index=True,
        comment="NULL apenas para catálogos padrão mantidos pelo sistema",
    )

    nome: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    sigla: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    descricao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ativo: Mapped[bool] = mapped_column(default=True, nullable=False)

    def __repr__(self) -> str:
        return f"<Setor {self.nome}>"
