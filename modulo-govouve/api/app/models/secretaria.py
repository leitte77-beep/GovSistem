import uuid
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.models.base import Base, SoftDeleteMixin, TimestampMixin

if TYPE_CHECKING:
    from app.models.organization import Organization


class Secretaria(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "secretarias"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    slug: Mapped[str] = mapped_column(
        String(100), nullable=False, index=True
    )
    nome: Mapped[str] = mapped_column(String(255), nullable=False)
    cnpj: Mapped[Optional[str]] = mapped_column(
        String(18), nullable=True
    )
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    config: Mapped[Optional[dict]] = mapped_column(
        JSON, nullable=True,
        comment="Branding, prazos customizados, limites de anexos",
    )
    ouvidor_responsavel: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True,
        comment="Nome do ouvidor responsável pela secretaria",
    )
    descricao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    organization: Mapped["Organization"] = relationship("Organization")

    def __repr__(self) -> str:
        return f"<Secretaria {self.slug}>"
