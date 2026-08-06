import uuid
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin
from app.models.enums import NaturezaEtapa, TipoConvenio

if TYPE_CHECKING:
    from app.models.convenio import Convenio


class TemplateFluxo(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "templates_fluxo"

    nome: Mapped[str] = mapped_column(String(255), nullable=False)
    tipo_convenio: Mapped[TipoConvenio] = mapped_column(
        String(20), nullable=False
    )
    descricao: Mapped[Optional[str]] = mapped_column(
        String(500), nullable=True
    )

    # Relationships
    etapas: Mapped[List["TemplateEtapa"]] = relationship(
        "TemplateEtapa", back_populates="template_fluxo", lazy="selectin",
        cascade="all, delete-orphan", order_by="TemplateEtapa.ordem",
    )
    convenios: Mapped[List["Convenio"]] = relationship(
        "Convenio", back_populates="template_fluxo"
    )

    def __repr__(self) -> str:
        return f"<TemplateFluxo {self.nome}>"


class TemplateEtapa(Base, TimestampMixin):
    __tablename__ = "templates_etapa"

    template_fluxo_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("templates_fluxo.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    nome: Mapped[str] = mapped_column(String(255), nullable=False)
    ordem: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    natureza: Mapped[NaturezaEtapa] = mapped_column(
        String(20), nullable=False, default=NaturezaEtapa.INTERNA
    )

    # Relationships
    template_fluxo: Mapped["TemplateFluxo"] = relationship(
        "TemplateFluxo", back_populates="etapas"
    )

    def __repr__(self) -> str:
        return f"<TemplateEtapa {self.nome} (ordem={self.ordem})>"
