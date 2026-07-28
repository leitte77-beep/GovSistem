"""Modelos do modulo habitacional."""
import uuid
from datetime import date
from typing import Optional

from sqlalchemy import Boolean, Date, ForeignKey, Integer, JSON, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class ProgramaHabitacional(Base, TimestampMixin):
    """Programa habitacional (Municipal, Estadual ou Federal)."""

    __tablename__ = "programas_habitacionais"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    nome: Mapped[str] = mapped_column(String(255), nullable=False)
    esfera: Mapped[str] = mapped_column(
        String(20), nullable=False,
        comment="Municipal | Estadual | Federal"
    )
    descricao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    criterios: Mapped[Optional[dict]] = mapped_column(
        JSON, nullable=True,
        comment="Faixas de renda, prioridades (idoso, deficiente, mulher chefe, etc.)"
    )
    condicoes_financiamento: Mapped[Optional[dict]] = mapped_column(
        JSON, nullable=True,
        comment="Juros, prazo, subsidio, entrada, parcelas"
    )
    ativo: Mapped[bool] = mapped_column(default=True)
    data_inicio: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    data_fim: Mapped[Optional[date]] = mapped_column(Date, nullable=True)


class DemandaHabitacional(Base, TimestampMixin):
    """Demanda de uma familia por programa habitacional."""

    __tablename__ = "demandas_habitacionais"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    family_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("families.id", ondelete="CASCADE"),
        nullable=False,
    )
    programa_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("programas_habitacionais.id", ondelete="SET NULL"),
        nullable=True,
    )
    tipo_demanda: Mapped[str] = mapped_column(
        String(30), nullable=False,
        comment="Casa_propria | Aluguel_social | Reforma | Regularizacao | Lote | Outro"
    )
    data_cadastro: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="CADASTRADA",
        comment="CADASTRADA | CLASSIFICADA | SELECIONADA | CONTEMPLADA | CANCELADA"
    )
    pontuacao: Mapped[Optional[float]] = mapped_column(Numeric(10, 2), nullable=True)
    observacoes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    family = relationship("Family", backref="demandas_habitacionais")
    programa = relationship("ProgramaHabitacional")


class DocumentoHabitacional(Base, TimestampMixin):
    """Documento anexado a uma demanda habitacional."""

    __tablename__ = "documentos_habitacionais"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    demanda_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("demandas_habitacionais.id", ondelete="CASCADE"),
        nullable=False,
    )
    nome: Mapped[str] = mapped_column(String(255), nullable=False)
    tipo: Mapped[str] = mapped_column(
        String(30), nullable=False,
        comment="RG | CPF | COMPROVANTE_RENDA | COMPROVANTE_RESIDENCIA | CERTIDAO | LAUDO | OUTRO"
    )
    storage_path: Mapped[str] = mapped_column(String(1000), nullable=False)
    content_type: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    tamanho_bytes: Mapped[Optional[int]] = mapped_column(nullable=True)

    demanda = relationship("DemandaHabitacional", backref="documentos")


class AtividadeHabitacional(Base, TimestampMixin):
    """Atividade em grupo para programas habitacionais (palestras, mutiroes, etc.)."""

    __tablename__ = "atividades_habitacionais"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    programa_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("programas_habitacionais.id", ondelete="SET NULL"),
        nullable=True,
    )
    nome: Mapped[str] = mapped_column(String(255), nullable=False)
    descricao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tipo: Mapped[str] = mapped_column(
        String(30), nullable=False,
        comment="Palestra | Mutirao | Reuniao | Visita_tecnica | Plantao_social | Outro"
    )
    data_inicio: Mapped[date] = mapped_column(Date, nullable=False)
    data_fim: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    local: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="ATIVA",
        comment="ATIVA | ENCERRADA | CANCELADA"
    )
