import uuid
from datetime import date
from typing import Optional

from sqlalchemy import Date, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class SiconData(Base, TimestampMixin):
    """Dados de condicionalidades importados do SICON (Sistema de Gestao de Condicionalidades do MDS)."""

    __tablename__ = "sicon_data"
    __table_args__ = (
        Index("ix_sicon_tenant_nis", "tenant_id", "nis_responsavel"),
        Index("ix_sicon_tenant_family", "tenant_id", "family_id"),
        Index("ix_sicon_tenant_referencia", "tenant_id", "data_referencia"),
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
    nis_responsavel: Mapped[str] = mapped_column(
        String(11), nullable=False, comment="NIS do responsavel familiar"
    )
    data_referencia: Mapped[date] = mapped_column(
        Date, nullable=False, comment="Mes/ano de referencia dos dados"
    )
    descumprimento_educacao: Mapped[bool] = mapped_column(
        default=False, comment="Ha descumprimento de condicionalidade de educacao"
    )
    descumprimento_saude: Mapped[bool] = mapped_column(
        default=False, comment="Ha descumprimento de condicionalidade de saude"
    )
    efeito_beneficio: Mapped[Optional[str]] = mapped_column(
        String(30), nullable=True,
        comment="Advertencia | Bloqueio | Suspensao | Cancelamento | Reversao"
    )
    data_efeito: Mapped[Optional[date]] = mapped_column(
        Date, nullable=True, comment="Data de inicio do efeito no beneficio"
    )
    membros_afetados: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="NIS dos membros com descumprimento (separados por virgula)"
    )
    observacoes: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="Informacoes adicionais do registro SICON"
    )
