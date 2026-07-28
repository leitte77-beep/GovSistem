import uuid
from datetime import date
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import (
    Date,
    ForeignKey,
    Index,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.acompanhamento import Acompanhamento
    from app.models.case_file import CaseFile
    from app.models.professional import Professional


class PlanoAcompanhamento(Base, TimestampMixin):
    """Plano de Acompanhamento Familiar.

    Diagnóstico, vulnerabilidades/potencialidades, objetivos e ações
    com responsável e prazo. Reavaliações periódicas.
    """

    __tablename__ = "planos_acompanhamento"
    __table_args__ = (
        Index("ix_plano_tenant_acomp", "tenant_id", "acompanhamento_id"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    acompanhamento_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("acompanhamentos.id", ondelete="CASCADE"),
        nullable=False,
    )
    case_file_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("case_files.id", ondelete="CASCADE"),
        nullable=False,
    )

    diagnostico: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    vulnerabilidades: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    potencialidades: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    objetivos: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    data_proxima_avaliacao: Mapped[Optional[date]] = mapped_column(
        Date, nullable=True
    )

    acompanhamento: Mapped["Acompanhamento"] = relationship("Acompanhamento")
    case_file: Mapped["CaseFile"] = relationship("CaseFile")
    acoes: Mapped[List["AcaoPlano"]] = relationship(
        "AcaoPlano",
        back_populates="plano",
        lazy="selectin",
        cascade="all, delete-orphan",
    )
    avaliacoes: Mapped[List["AvaliacaoPlano"]] = relationship(
        "AvaliacaoPlano",
        back_populates="plano",
        lazy="selectin",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<PlanoAcompanhamento {self.id}>"


class AcaoPlano(Base, TimestampMixin):
    """Ação definida no plano de acompanhamento."""

    __tablename__ = "acoes_plano"
    __table_args__ = (
        Index("ix_acao_tenant_plano", "tenant_id", "plano_id"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    plano_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("planos_acompanhamento.id", ondelete="CASCADE"),
        nullable=False,
    )
    descricao: Mapped[str] = mapped_column(Text, nullable=False)
    responsavel_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("professionals.id", ondelete="SET NULL"),
        nullable=True,
    )
    prazo: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="PENDENTE"
    )
    data_conclusao: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    plano: Mapped["PlanoAcompanhamento"] = relationship(
        "PlanoAcompanhamento", back_populates="acoes"
    )
    responsavel: Mapped[Optional["Professional"]] = relationship("Professional")

    def __repr__(self) -> str:
        return f"<AcaoPlano {self.status}>"


class AvaliacaoPlano(Base, TimestampMixin):
    """Avaliação periódica do plano de acompanhamento."""

    __tablename__ = "avaliacoes_plano"
    __table_args__ = (
        Index("ix_aval_tenant_plano", "tenant_id", "plano_id"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    plano_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("planos_acompanhamento.id", ondelete="CASCADE"),
        nullable=False,
    )
    data_avaliacao: Mapped[date] = mapped_column(Date, nullable=False)
    avaliador_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("professionals.id", ondelete="SET NULL"),
        nullable=True,
    )
    evolucao_enc: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="Evolução criptografada da avaliação"
    )
    resultado: Mapped[str] = mapped_column(
        String(20), nullable=False, default="PARCIAL"
    )
    nova_data_avaliacao: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    plano: Mapped["PlanoAcompanhamento"] = relationship(
        "PlanoAcompanhamento", back_populates="avaliacoes"
    )
    avaliador: Mapped[Optional["Professional"]] = relationship("Professional")

    def __repr__(self) -> str:
        return f"<AvaliacaoPlano {self.resultado}>"
