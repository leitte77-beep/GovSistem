import uuid
from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin
from app.models.enums import (
    ModoEtapa,
    NaturezaEtapa,
    RegraConclusaoEtapa,
    StatusEtapa,
)

if TYPE_CHECKING:
    from app.models.anexo import Anexo
    from app.models.convenio import Convenio
    from app.models.demanda import Demanda
    from app.models.tarefa import Tarefa


class Etapa(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "etapas"

    convenio_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("convenios.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    demanda_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("demandas.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
        comment="Demanda dona da etapa (núcleo v2)",
    )
    workflow_versao_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workflow_versoes.id", ondelete="SET NULL"),
        nullable=True,
        comment="Versão do fluxo com que esta demanda começou",
    )
    workflow_etapa_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workflow_etapas.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        comment="Receita que originou esta etapa",
    )
    modo: Mapped[ModoEtapa] = mapped_column(
        String(20), nullable=False, default=ModoEtapa.SEQUENCIAL
    )
    regra_conclusao: Mapped[RegraConclusaoEtapa] = mapped_column(
        String(20), nullable=False, default=RegraConclusaoEtapa.TODAS_TAREFAS
    )
    documentos_obrigatorios: Mapped[Optional[list]] = mapped_column(
        JSON, nullable=True
    )
    peso: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0,
        comment="Peso da etapa no progresso da demanda (§68); 0 = distribuir igualmente",
    )
    descricao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    setor_responsavel_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("setores.id", ondelete="SET NULL"),
        nullable=True,
    )
    prazo: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True, comment="Prazo da etapa (§35)"
    )
    nome: Mapped[str] = mapped_column(String(255), nullable=False)
    ordem: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    natureza: Mapped[NaturezaEtapa] = mapped_column(
        String(20), nullable=False, default=NaturezaEtapa.INTERNA
    )
    status: Mapped[StatusEtapa] = mapped_column(
        String(30), nullable=False, default=StatusEtapa.PENDENTE
    )
    prazo_governo: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True,
        comment="Prazo que o governo deu para esta etapa"
    )
    resposta_governo: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True,
        comment="Resposta recebida do governo"
    )
    data_inicio: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    data_conclusao: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    convenio: Mapped[Optional["Convenio"]] = relationship(
        "Convenio", back_populates="etapas"
    )
    demanda: Mapped[Optional["Demanda"]] = relationship("Demanda")
    tarefas: Mapped[List["Tarefa"]] = relationship(
        "Tarefa", back_populates="etapa", lazy="selectin",
        cascade="all, delete-orphan",
    )
    anexos: Mapped[List["Anexo"]] = relationship(
        "Anexo", back_populates="etapa", lazy="selectin",
        cascade="all, delete-orphan",
        primaryjoin="and_(Anexo.etapa_id == Etapa.id, Anexo.tarefa_id.is_(None))",
        viewonly=True,
    )

    def __repr__(self) -> str:
        return f"<Etapa {self.nome} [{self.status.value}]>"
