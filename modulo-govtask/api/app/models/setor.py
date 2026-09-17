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

    responsavel_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        comment="Chefe do departamento — segundo degrau do escalonamento (§38)",
    )
    setor_pai_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("setores.id", ondelete="SET NULL"),
        nullable=True,
        comment="Hierarquia Secretaria → Departamento → Setor (§99)",
    )

    nome: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    sigla: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    descricao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    setor_pai_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("setores.id", ondelete="SET NULL"),
        nullable=True,
        comment="Hierarquia Secretaria → Departamento → Setor (§99)",
    )
    responsavel_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        comment="Chefia do setor; é o segundo degrau do escalonamento (§38)",
    )
    ativo: Mapped[bool] = mapped_column(default=True, nullable=False)

    def __repr__(self) -> str:
        return f"<Setor {self.nome}>"
