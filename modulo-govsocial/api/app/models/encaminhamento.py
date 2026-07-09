import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin

if TYPE_CHECKING:
    from app.models.case_file import CaseFile
    from app.models.professional import Professional
    from app.models.unit import Unit


class Encaminhamento(Base, TimestampMixin, SoftDeleteMixin):
    """Encaminhamento interno (entre unidades SUAS) ou externo (para outras
    políticas/serviços).

    Interno: unidade_destino_id preenchido; fluxo PENDENTE → ACEITO →
    DEVOLVIDO (contrarreferência).
    Externo: referral_code + ofício numerado por tenant/unidade.
    """

    __tablename__ = "encaminhamentos"
    __table_args__ = (
        Index("ix_enc_tenant_casefile", "tenant_id", "case_file_id"),
        Index("ix_enc_tenant_origem", "tenant_id", "unit_id"),
        Index("ix_enc_tenant_destino", "tenant_id", "unidade_destino_id"),
        Index("ix_enc_tenant_status", "tenant_id", "status"),
        Index("ix_enc_tenant_tipo", "tenant_id", "tipo"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    case_file_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("case_files.id", ondelete="SET NULL"),
        nullable=True,
    )
    unit_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("units.id", ondelete="CASCADE"),
        nullable=False,
        comment="Unidade de origem"
    )
    tipo: Mapped[str] = mapped_column(String(15), nullable=False)

    # Interno
    unidade_destino_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("units.id", ondelete="SET NULL"),
        nullable=True,
    )
    profissional_destino_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("professionals.id", ondelete="SET NULL"),
        nullable=True,
    )
    data_aceite: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    data_devolutiva: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Externo
    referral_code: Mapped[Optional[str]] = mapped_column(
        String(40), nullable=True,
        comment="Código do domínio ReferralCode (SAUDE, EDUCACAO, etc.)"
    )
    instituicao_destino: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True,
        comment="Nome da instituição/órgão de destino"
    )
    numero_oficio: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True,
        comment="Número sequencial do ofício por tenant/unidade"
    )

    # Campos comuns
    profissional_origem_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("professionals.id", ondelete="SET NULL"),
        nullable=True,
    )
    data_encaminhamento: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.utcnow()
    )
    motivo: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    descricao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="PENDENTE"
    )
    devolutiva_enc: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="Contrarreferência criptografada"
    )
    motivo_recusa: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    oficio_gerado: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )

    unit: Mapped["Unit"] = relationship(
        "Unit", foreign_keys=[unit_id]
    )
    unidade_destino: Mapped[Optional["Unit"]] = relationship(
        "Unit", foreign_keys=[unidade_destino_id]
    )
    profissional_origem: Mapped[Optional["Professional"]] = relationship(
        "Professional", foreign_keys=[profissional_origem_id]
    )
    profissional_destino: Mapped[Optional["Professional"]] = relationship(
        "Professional", foreign_keys=[profissional_destino_id]
    )
    case_file: Mapped[Optional["CaseFile"]] = relationship("CaseFile")

    def __repr__(self) -> str:
        return f"<Encaminhamento {self.tipo} {self.status}>"
