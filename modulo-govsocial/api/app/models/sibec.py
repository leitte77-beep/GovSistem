import uuid
from datetime import date, datetime
from typing import Optional

from sqlalchemy import BigInteger, Date, DateTime, ForeignKey, Index, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class SibecData(Base, TimestampMixin):
    """Dados de beneficios importados do Sibec (Sistema de Beneficios ao Cidadao do PBF)."""

    __tablename__ = "sibec_data"
    __table_args__ = (
        Index("ix_sibec_tenant_nis", "tenant_id", "nis"),
        Index("ix_sibec_tenant_family", "tenant_id", "family_id"),
        Index("ix_sibec_tenant_referencia", "tenant_id", "data_referencia"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    family_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("families.id", ondelete="SET NULL"),
        nullable=True,
        comment="Familia vinculada apos reconciliacao",
    )
    person_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("persons.id", ondelete="SET NULL"),
        nullable=True,
        comment="Pessoa vinculada apos reconciliacao",
    )
    nis: Mapped[str] = mapped_column(
        String(11), nullable=False, comment="NIS do beneficiario"
    )
    nome_beneficiario: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True,
    )
    tipo_beneficio: Mapped[str] = mapped_column(
        String(40), nullable=False,
        comment="Basico | Variavel | Variavel_Extraordinario | BPI | Superacao_Extrema_Pobreza"
    )
    valor: Mapped[Optional[float]] = mapped_column(
        Numeric(12, 2), nullable=True,
    )
    data_concessao: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    data_referencia: Mapped[date] = mapped_column(
        Date, nullable=False, comment="Mes/ano de referencia da folha Sibec"
    )
    situacao: Mapped[Optional[str]] = mapped_column(
        String(30), nullable=True,
        comment="Ativo | Bloqueado | Suspenso | Cancelado"
    )
    data_bloqueio: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    motivo_bloqueio: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    data_desbloqueio: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    observacoes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
