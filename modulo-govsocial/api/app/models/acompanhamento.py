import uuid
from datetime import date
from typing import TYPE_CHECKING, Optional

from sqlalchemy import (
    Date,
    ForeignKey,
    Index,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin

if TYPE_CHECKING:
    from app.models.case_file import CaseFile
    from app.models.professional import Professional


class Acompanhamento(Base, TimestampMixin, SoftDeleteMixin):
    """Acompanhamento sistemático (PAIF, PAEFI, MSE).

    Distinção formal entre atendimento pontual e acompanhamento sistemático
    com data início/fim — alimenta diretamente o RMA.
    """

    __tablename__ = "acompanhamentos"
    __table_args__ = (
        Index("ix_acomp_tenant_casefile", "tenant_id", "case_file_id"),
        Index("ix_acomp_tenant_tipo", "tenant_id", "tipo"),
        Index("ix_acomp_tenant_situacao", "tenant_id", "situacao"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    case_file_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("case_files.id", ondelete="CASCADE"),
        nullable=False,
    )
    tipo: Mapped[str] = mapped_column(
        String(20), nullable=False, comment="PAIF, PAEFI, MSE-LA, MSE-PSC"
    )
    data_inicio: Mapped[date] = mapped_column(Date, nullable=False)
    data_fim: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    motivo_desligamento: Mapped[Optional[str]] = mapped_column(
        String(40), nullable=True
    )
    situacao: Mapped[str] = mapped_column(
        String(20), nullable=False, default="ATIVO"
    )
    observacoes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    profissional_responsavel_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("professionals.id", ondelete="SET NULL"),
        nullable=True,
    )

    case_file: Mapped["CaseFile"] = relationship("CaseFile")
    profissional: Mapped[Optional["Professional"]] = relationship("Professional")

    def __repr__(self) -> str:
        return f"<Acompanhamento {self.tipo} {self.situacao}>"
