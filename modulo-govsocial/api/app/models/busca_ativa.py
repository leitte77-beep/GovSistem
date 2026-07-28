import uuid
from datetime import date, datetime
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
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.types import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin

if TYPE_CHECKING:
    from app.models.professional import Professional


class BuscaAtiva(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "buscas_ativas"
    __table_args__ = (
        Index("ix_ba_tenant_data", "tenant_id", "data_acao"),
        Index("ix_ba_tenant_professional", "tenant_id", "professional_id"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    professional_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("professionals.id", ondelete="SET NULL"),
        nullable=True,
    )
    data_acao: Mapped[date] = mapped_column(Date, nullable=False)
    local_logradouro: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    local_bairro: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    local_referencia: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    latitude: Mapped[Optional[float]] = mapped_column(nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(nullable=True)
    equipe_nomes: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    pessoas_abordadas: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    pessoas_aceitaram_acolhimento: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    pessoas_encaminhadas: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    observacoes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    fotos_urls: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)

    profissional: Mapped[Optional["Professional"]] = relationship("Professional")
    pessoas: Mapped[List["PessoaAbordada"]] = relationship(
        "PessoaAbordada", back_populates="busca_ativa", lazy="selectin",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<BuscaAtiva {self.data_acao} {self.local_bairro or ''}>"


class PessoaAbordada(Base, TimestampMixin):
    __tablename__ = "pessoas_abordadas"
    __table_args__ = (
        Index("ix_pa_tenant_busca", "tenant_id", "busca_ativa_id"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    busca_ativa_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("buscas_ativas.id", ondelete="CASCADE"),
        nullable=False,
    )
    nome: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    nome_social: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    idade_estimada: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    sexo: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    possui_documento: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    tempo_rua_estimado: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    aceitou_acolhimento: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    encaminhado_para: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    observacoes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    busca_ativa: Mapped["BuscaAtiva"] = relationship("BuscaAtiva", back_populates="pessoas")

    def __repr__(self) -> str:
        return f"<PessoaAbordada {self.nome or 'anônimo'}>"
