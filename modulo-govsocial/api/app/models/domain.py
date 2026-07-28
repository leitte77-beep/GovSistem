import uuid
from datetime import date
from typing import Optional

from sqlalchemy import (
    Boolean,
    Date,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class _DomainBase(TimestampMixin):
    """Colunas comuns dos domínios versionados por vigência e por tenant.

    Cada tenant recebe uma cópia do seed nacional no onboarding; overrides
    locais são criados com source=LOCAL. Isolamento por tenant_id (aplicação).
    """

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    code: Mapped[str] = mapped_column(
        String(40), nullable=False, comment="Código nacional estável"
    )
    nome: Mapped[str] = mapped_column(String(255), nullable=False)
    source: Mapped[str] = mapped_column(String(10), nullable=False, default="NACIONAL")
    vigencia_inicio: Mapped[date] = mapped_column(Date, nullable=False)
    vigencia_fim: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class ServiceType(Base, _DomainBase):
    """Serviços da Tipificação Nacional (PAIF, PAEFI, SCFV, MSE, etc.)."""

    __tablename__ = "service_types"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id", "code", "vigencia_inicio", name="uq_service_type_vigencia"
        ),
        Index("ix_service_types_tenant_ativo", "tenant_id", "ativo"),
    )

    sigla: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    protecao: Mapped[Optional[str]] = mapped_column(
        String(20), nullable=True, comment="BASICA | ESPECIAL_MEDIA | ESPECIAL_ALTA"
    )


class AccessForm(Base, _DomainBase):
    """Formas de acesso do RMA (demanda espontânea, busca ativa, encaminhamento)."""

    __tablename__ = "access_forms"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id", "code", "vigencia_inicio", name="uq_access_form_vigencia"
        ),
        Index("ix_access_forms_tenant_ativo", "tenant_id", "ativo"),
    )


class ReferralCode(Base, _DomainBase):
    """Códigos de encaminhamento do Prontuário SUAS."""

    __tablename__ = "referral_codes"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id", "code", "vigencia_inicio", name="uq_referral_code_vigencia"
        ),
        Index("ix_referral_codes_tenant_ativo", "tenant_id", "ativo"),
    )

    area: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)


class BenefitType(Base, _DomainBase):
    """Tipos de benefício eventual (semente nacional; valores/critérios por tenant)."""

    __tablename__ = "benefit_types"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id", "code", "vigencia_inicio", name="uq_benefit_type_vigencia"
        ),
        Index("ix_benefit_types_tenant_ativo", "tenant_id", "ativo"),
    )

    categoria: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    unidade_medida: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    exige_parecer: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    periodicidade_max_dias: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True, comment="Janela de antiduplicidade em dias"
    )
