import uuid
from datetime import date
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import JSON, Date, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.acompanhamento import Acompanhamento
    from app.models.case_file import CaseFile
    from app.models.professional import Professional


class Pia(Base, TimestampMixin):
    """Plano Individual de Atendimento (PIA) para medidas socioeducativas e
    acolhimento.

    Contém dados do processo judicial, medida, prazos, objetivos e
    relatórios ao judiciário.
    """

    __tablename__ = "pias"
    __table_args__ = (
        Index("ix_pia_tenant_casefile", "tenant_id", "case_file_id"),
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
    acompanhamento_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("acompanhamentos.id", ondelete="SET NULL"),
        nullable=True,
    )

    numero_processo: Mapped[str] = mapped_column(String(120), nullable=False)
    vara: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    comarca: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    medida_socioeducativa: Mapped[str] = mapped_column(
        String(30), nullable=False, comment="LA, PSC, SEMILIBERDADE, INTERNACAO"
    )
    prazo_medida: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, comment="Prazo em meses")
    horas_totais: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, comment="Horas totais (CCXXII)")
    horas_mensais: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, comment="Horas mensais")
    horas_cumpridas: Mapped[Optional[int]] = mapped_column(Integer, default=0, nullable=True, comment="Horas cumpridas")
    horas_restantes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, comment="Horas restantes")
    data_inicio_medida: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    data_fim_medida: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    frequencia_cumprimento: Mapped[Optional[str]] = mapped_column(
        String(20), nullable=True
    )
    dias_cumprimento: Mapped[Optional[dict]] = mapped_column(
        JSON, nullable=True, comment="Dias da semana de cumprimento"
    )
    objetivos: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    acoes: Mapped[Optional[list]] = mapped_column(
        JSON, nullable=True, comment="Lista de ações do PIA"
    )
    proximo_relatorio_judiciario: Mapped[Optional[date]] = mapped_column(
        Date, nullable=True
    )

    case_file: Mapped["CaseFile"] = relationship("CaseFile")
    acompanhamento: Mapped[Optional["Acompanhamento"]] = relationship(
        "Acompanhamento"
    )
    relatorios: Mapped[List["RelatorioPia"]] = relationship(
        "RelatorioPia",
        back_populates="pia",
        lazy="selectin",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<Pia {self.medida_socioeducativa} proc={self.numero_processo}>"


class RelatorioPia(Base, TimestampMixin):
    """Relatório enviado ao judiciário sobre o cumprimento da medida."""

    __tablename__ = "relatorios_pia"
    __table_args__ = (
        Index("ix_relpia_tenant_pia", "tenant_id", "pia_id"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    pia_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("pias.id", ondelete="CASCADE"),
        nullable=False,
    )
    data_relatorio: Mapped[date] = mapped_column(Date, nullable=False)
    tipo: Mapped[str] = mapped_column(
        String(30), nullable=False, comment="INICIAL, ACOMPANHAMENTO, FINAL"
    )
    elaborado_por_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("professionals.id", ondelete="SET NULL"),
        nullable=True,
    )
    texto_enc: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="Texto criptografado do relatório"
    )

    pia: Mapped["Pia"] = relationship("Pia", back_populates="relatorios")
    elaborado_por: Mapped[Optional["Professional"]] = relationship("Professional")

    def __repr__(self) -> str:
        return f"<RelatorioPia {self.tipo} {self.data_relatorio}>"

    horas_totais: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True, comment="Horas totais da medida (CCXXII)"
    )
    horas_mensais: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True, comment="Horas mensais"
    )
    horas_cumpridas: Mapped[Optional[int]] = mapped_column(
        Integer, default=0, nullable=True, comment="Horas cumpridas"
    )
    horas_restantes: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True, comment="Horas restantes"
    )
