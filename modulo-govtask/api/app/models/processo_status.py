import uuid
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin

if TYPE_CHECKING:
    from app.models.organization import Organization


class ProcessoStatus(Base, TimestampMixin, SoftDeleteMixin):
    """Status configurável do processo, por tenant (ou global se organization_id NULL)."""

    __tablename__ = "processos_status"

    organization_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
        comment="NULL = catálogo padrão do sistema",
    )
    chave: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    rotulo: Mapped[str] = mapped_column(String(100), nullable=False)
    ordem: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    cor: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    is_final: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    organization: Mapped[Optional["Organization"]] = relationship("Organization")

    def __repr__(self) -> str:
        return f"<ProcessoStatus {self.chave}>"
