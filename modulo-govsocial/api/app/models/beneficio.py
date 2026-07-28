import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    JSON,
    Numeric,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin

if TYPE_CHECKING:
    from app.models.family import Family
    from app.models.person import Person
    from app.models.professional import Professional
    from app.models.unit import Unit


class EstoqueUnidade(Base, TimestampMixin):
    """Controle de estoque/dotação por unidade e tipo de benefício."""

    __tablename__ = "unit_stocks"
    __table_args__ = (
        Index("ix_stock_tenant_unit", "tenant_id", "unit_id"),
        Index("ix_stock_tenant_benefit", "tenant_id", "benefit_type_code"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    unit_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("units.id", ondelete="CASCADE"),
        nullable=False,
    )
    benefit_type_code: Mapped[str] = mapped_column(
        String(40), nullable=False,
        comment="Código do tipo de benefício (NATALIDADE, FUNERAL, etc.)"
    )
    quantidade_atual: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=0
    )
    quantidade_minima: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=0
    )
    unidade_medida: Mapped[str] = mapped_column(
        String(30), nullable=False, default="UNIDADE",
        comment="UNIDADE, CESTA, KG, LITRO, etc."
    )
    valor_unitario_referencia: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(12, 2), nullable=True
    )

    unit: Mapped["Unit"] = relationship("Unit")

    def __repr__(self) -> str:
        return f"<EstoqueUnidade {self.benefit_type_code} qtd={self.quantidade_atual}>"


class ConcessaoBeneficio(Base, TimestampMixin):
    """Concessão de benefício eventual a uma família/pessoa.

    Fluxo: SOLICITADO → EM_ANALISE → APROVADO → ENTREGUE
                                    → NEGADO
                                    → CANCELADO
    """

    __tablename__ = "benefit_concessions"
    __table_args__ = (
        Index("ix_concessao_tenant_family", "tenant_id", "family_id"),
        Index("ix_concessao_tenant_status", "tenant_id", "status"),
        Index("ix_concessao_tenant_unit", "tenant_id", "unit_id"),
        Index("ix_concessao_tenant_benefit", "tenant_id", "benefit_type_code"),
        Index("ix_concessao_tenant_data", "tenant_id", "data_solicitacao"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    family_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("families.id", ondelete="CASCADE"),
        nullable=False,
    )
    person_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("persons.id", ondelete="SET NULL"),
        nullable=True,
        comment="Membro da família beneficiado (se individual)"
    )
    unit_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("units.id", ondelete="CASCADE"),
        nullable=False,
    )
    benefit_type_code: Mapped[str] = mapped_column(
        String(40), nullable=False
    )
    quantidade: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=1
    )
    valor_total: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(12, 2), nullable=True
    )

    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="SOLICITADO"
    )

    data_solicitacao: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.utcnow()
    )
    data_analise: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    data_aprovacao: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    data_entrega: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    solicitado_por_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("professionals.id", ondelete="SET NULL"),
        nullable=True,
    )
    analisado_por_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("professionals.id", ondelete="SET NULL"),
        nullable=True,
    )
    aprovado_por_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("professionals.id", ondelete="SET NULL"),
        nullable=True,
    )

    parecer_enc: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="Parecer técnico criptografado"
    )
    motivo_negacao: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True
    )

    comprovante_gerado: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    assinatura_data: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True,
        comment="Data/hora da assinatura do comprovante pelo beneficiário"
    )

    family: Mapped["Family"] = relationship("Family")
    person: Mapped[Optional["Person"]] = relationship("Person")
    unit: Mapped["Unit"] = relationship("Unit")
    solicitado_por: Mapped[Optional["Professional"]] = relationship(
        "Professional", foreign_keys=[solicitado_por_id]
    )
    analisado_por: Mapped[Optional["Professional"]] = relationship(
        "Professional", foreign_keys=[analisado_por_id]
    )
    aprovado_por: Mapped[Optional["Professional"]] = relationship(
        "Professional", foreign_keys=[aprovado_por_id]
    )

    def __repr__(self) -> str:
        return f"<ConcessaoBeneficio {self.benefit_type_code} {self.status}>"


class LimiteBeneficio(Base, TimestampMixin):
    """Limite quantitativo ou financeiro para concessao de beneficios por beneficiario."""

    __tablename__ = "limites_beneficio"
    __table_args__ = (
        Index("ix_limites_tenant_benefit", "tenant_id", "benefit_type_code"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    benefit_type_code: Mapped[str] = mapped_column(String(40), nullable=False)
    tipo_limite: Mapped[str] = mapped_column(
        String(20), nullable=False, comment="QUANTITATIVO | FINANCEIRO"
    )
    valor_maximo: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    periodo_dias: Mapped[int] = mapped_column(default=365)
    por_familia: Mapped[bool] = mapped_column(default=True)
    bloquear_concessao: Mapped[bool] = mapped_column(default=True)
    ativo: Mapped[bool] = mapped_column(default=True)


class BeneficioRecorrente(Base, TimestampMixin, SoftDeleteMixin):
    """Beneficio recorrente/periodico com programacao de entregas (CCXL-CCXLI, CCXXX-CCXXXIV)."""
    __tablename__ = "beneficios_recorrentes"
    __table_args__ = (Index("ix_br_tenant", "tenant_id"), Index("ix_br_tenant_family", "tenant_id", "family_id"))

    tenant_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    benefit_type_code: Mapped[str] = mapped_column(String(40), nullable=False)
    family_id: Mapped[str] = mapped_column(UUID(as_uuid=True), ForeignKey("families.id", ondelete="CASCADE"), nullable=False)
    person_id: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=True), ForeignKey("persons.id", ondelete="SET NULL"), nullable=True)
    unit_id: Mapped[str] = mapped_column(UUID(as_uuid=True), ForeignKey("units.id", ondelete="CASCADE"), nullable=False)
    periodicidade: Mapped[str] = mapped_column(String(20), nullable=False, comment="DIARIA | SEMANAL | QUINZENAL | MENSAL | BIMESTRAL | TRIMESTRAL | SEMESTRAL | ANUAL")
    quantidade: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    valor: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    data_inicio: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    data_fim: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    entrega_automatica: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, comment="Se True, gera entregas automaticamente")
    observacoes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class EntregaProgramada(Base, TimestampMixin):
    """Entrega individual de um beneficio recorrente (CCXXXIV)."""
    __tablename__ = "entregas_programadas"
    __table_args__ = (Index("ix_ep_tenant", "tenant_id"), Index("ix_ep_status", "tenant_id", "status"))

    tenant_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    beneficio_recorrente_id: Mapped[str] = mapped_column(UUID(as_uuid=True), ForeignKey("beneficios_recorrentes.id", ondelete="CASCADE"), nullable=False)
    data_prevista: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    data_entrega: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="PENDENTE", comment="PENDENTE | ENTREGUE | CANCELADO")
    quantidade: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    profissional_id: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=True), nullable=True)


class BeneficioColetivo(Base, TimestampMixin, SoftDeleteMixin):
    """Beneficio concedido de forma coletiva a multiplos cidadaos (CCXXXV, CCXXXI)."""
    __tablename__ = "beneficios_coletivos"
    __table_args__ = (Index("ix_bc_tenant", "tenant_id"),)

    tenant_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    benefit_type_code: Mapped[str] = mapped_column(String(40), nullable=False)
    unit_id: Mapped[str] = mapped_column(UUID(as_uuid=True), ForeignKey("units.id", ondelete="CASCADE"), nullable=False)
    grupo_id: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=True), nullable=True)
    data: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    descricao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    participantes: Mapped[Optional[list]] = mapped_column(JSON, nullable=True, comment="Lista [{person_id, nome, quantidade}]")
    profissionais: Mapped[Optional[list]] = mapped_column(JSON, nullable=True, comment="Lista [{professional_id, nome}]")
    registrado_por_id: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=True), nullable=True)
