import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin
from app.models.enums import StatusConvenio, TipoConvenio

if TYPE_CHECKING:
    from app.models.anexo import Anexo
    from app.models.etapa import Etapa
    from app.models.evento_timeline import EventoTimeline
    from app.models.notificacao import Notificacao
    from app.models.tarefa import Tarefa
    from app.models.template_fluxo import TemplateFluxo
    from app.models.user import User


class Convenio(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "convenios"

    titulo: Mapped[str] = mapped_column(String(500), nullable=False)
    descricao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tipo: Mapped[TipoConvenio] = mapped_column(
        String(20), nullable=False, default=TipoConvenio.OUTRO
    )
    origem: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True, comment="Órgão/entidade de origem do convênio"
    )
    numero_protocolo_governo: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True, index=True,
        comment="Número de protocolo no sistema do governo"
    )
    valor: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(15, 2), nullable=True
    )
    status: Mapped[StatusConvenio] = mapped_column(
        String(20), nullable=False, default=StatusConvenio.RASCUNHO
    )
    data_protocolo: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    responsavel_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    template_fluxo_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("templates_fluxo.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Relationships
    responsavel: Mapped["User"] = relationship("User", foreign_keys=[responsavel_id])
    template_fluxo: Mapped[Optional["TemplateFluxo"]] = relationship(
        "TemplateFluxo", back_populates="convenios"
    )
    etapas: Mapped[List["Etapa"]] = relationship(
        "Etapa", back_populates="convenio", lazy="selectin",
        cascade="all, delete-orphan", order_by="Etapa.ordem",
    )
    tarefas: Mapped[List["Tarefa"]] = relationship(
        "Tarefa", back_populates="convenio", lazy="selectin",
        cascade="all, delete-orphan",
    )
    anexos: Mapped[List["Anexo"]] = relationship(
        "Anexo", back_populates="convenio", lazy="selectin",
        cascade="all, delete-orphan",
        primaryjoin="and_(Anexo.convenio_id == Convenio.id, Anexo.tarefa_id.is_(None), Anexo.etapa_id.is_(None), Anexo.deleted_at.is_(None))",
        viewonly=True,
    )
    eventos: Mapped[List["EventoTimeline"]] = relationship(
        "EventoTimeline", back_populates="convenio", lazy="selectin",
        cascade="all, delete-orphan", order_by="EventoTimeline.ocorrido_em",
    )
    notificacoes: Mapped[List["Notificacao"]] = relationship(
        "Notificacao", back_populates="convenio", lazy="selectin",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<Convenio {self.titulo} [{self.status.value}]>"
