import uuid
from datetime import date, datetime, time
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    Time,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin

if TYPE_CHECKING:
    from app.models.person import Person
    from app.models.professional import Professional
    from app.models.unit import Unit


class AcaoColetiva(Base, TimestampMixin, SoftDeleteMixin):
    """Grupos SCFV, oficinas, palestras e eventos coletivos."""

    __tablename__ = "acoes_coletivas"
    __table_args__ = (
        Index("ix_ac_tenant_unit", "tenant_id", "unit_id"),
        Index("ix_ac_tenant_tipo", "tenant_id", "tipo"),
        Index("ix_ac_tenant_status", "tenant_id", "status"),
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
    nome: Mapped[str] = mapped_column(String(255), nullable=False)
    descricao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tipo: Mapped[str] = mapped_column(
        String(20), nullable=False, default="GRUPO_SCFV"
    )
    service_type_code: Mapped[Optional[str]] = mapped_column(
        String(40), nullable=True, comment="SCFV ou outro serviço tipificado"
    )
    faixa_etaria: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    publico_alvo: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    data_inicio: Mapped[date] = mapped_column(Date, nullable=False)
    data_fim: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    periodicidade: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    dia_semana: Mapped[Optional[str]] = mapped_column(
        String(15), nullable=True,
        comment="segunda, terca, quarta, quinta, sexta, sabado"
    )
    horario_inicio: Mapped[Optional[time]] = mapped_column(Time, nullable=True)
    horario_fim: Mapped[Optional[time]] = mapped_column(Time, nullable=True)

    local: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    vagas_total: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    vagas_disponiveis: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="ATIVA"
    )
    profissional_responsavel_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("professionals.id", ondelete="SET NULL"),
        nullable=True,
    )

    unit: Mapped["Unit"] = relationship("Unit")
    profissional: Mapped[Optional["Professional"]] = relationship("Professional")
    inscricoes: Mapped[List["Inscricao"]] = relationship(
        "Inscricao", back_populates="acao", lazy="selectin",
        cascade="all, delete-orphan",
    )
    encontros: Mapped[List["EncontroFrequencia"]] = relationship(
        "EncontroFrequencia", back_populates="acao", lazy="selectin",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<AcaoColetiva {self.nome} {self.status}>"


class Inscricao(Base, TimestampMixin):
    """Inscrição de uma pessoa/família em ação coletiva."""

    __tablename__ = "inscricoes"
    __table_args__ = (
        Index("ix_insc_tenant_acao", "tenant_id", "acao_coletiva_id"),
        Index("ix_insc_tenant_person", "tenant_id", "person_id"),
        Index("ix_insc_tenant_status", "tenant_id", "status"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    acao_coletiva_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("acoes_coletivas.id", ondelete="CASCADE"),
        nullable=False,
    )
    person_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("persons.id", ondelete="CASCADE"),
        nullable=False,
    )
    family_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("families.id", ondelete="SET NULL"),
        nullable=True,
    )
    data_inscricao: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.utcnow()
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="ATIVA"
    )
    motivo_desligamento: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    acao: Mapped["AcaoColetiva"] = relationship(
        "AcaoColetiva", back_populates="inscricoes"
    )
    person: Mapped["Person"] = relationship("Person")

    def __repr__(self) -> str:
        return f"<Inscricao {self.status}>"


class EncontroFrequencia(Base, TimestampMixin):
    """Encontro/evento de uma ação coletiva onde se registra frequência."""

    __tablename__ = "encontros_frequencia"
    __table_args__ = (
        Index("ix_ef_tenant_acao", "tenant_id", "acao_coletiva_id"),
        Index("ix_ef_tenant_data", "tenant_id", "data_encontro"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    acao_coletiva_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("acoes_coletivas.id", ondelete="CASCADE"),
        nullable=False,
    )
    data_encontro: Mapped[date] = mapped_column(Date, nullable=False)
    tema: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    observacoes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    acao: Mapped["AcaoColetiva"] = relationship(
        "AcaoColetiva", back_populates="encontros"
    )
    registros: Mapped[List["RegistroFrequencia"]] = relationship(
        "RegistroFrequencia", back_populates="encontro", lazy="selectin",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<EncontroFrequencia {self.data_encontro}>"


class RegistroFrequencia(Base, TimestampMixin):
    """Registro individual de presença num encontro."""

    __tablename__ = "registros_frequencia"
    __table_args__ = (
        Index("ix_rf_tenant_encontro", "tenant_id", "encontro_id"),
        Index("ix_rf_tenant_inscricao", "tenant_id", "inscricao_id"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    encontro_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("encontros_frequencia.id", ondelete="CASCADE"),
        nullable=False,
    )
    inscricao_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("inscricoes.id", ondelete="CASCADE"),
        nullable=False,
    )
    presente: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    justificativa: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    encontro: Mapped["EncontroFrequencia"] = relationship(
        "EncontroFrequencia", back_populates="registros"
    )

    def __repr__(self) -> str:
        return f"<RegistroFrequencia {'P' if self.presente else 'F'}>"
