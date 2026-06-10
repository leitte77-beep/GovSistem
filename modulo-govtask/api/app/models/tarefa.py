import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin
from app.models.enums import Prioridade, StatusTarefa

if TYPE_CHECKING:
    from app.models.anexo import Anexo
    from app.models.comentario import Comentario
    from app.models.contestacao import Contestacao
    from app.models.convenio import Convenio
    from app.models.etapa import Etapa
    from app.models.evento_timeline import EventoTimeline
    from app.models.notificacao import Notificacao
    from app.models.setor import Setor
    from app.models.user import User


class Tarefa(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "tarefas"

    convenio_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("convenios.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    etapa_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("etapas.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    titulo: Mapped[str] = mapped_column(String(500), nullable=False)
    descricao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    criada_por_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    atribuida_a_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    setor_destino_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("setores.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    prioridade: Mapped[Prioridade] = mapped_column(
        String(10), nullable=False, default=Prioridade.NORMAL
    )
    prazo: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
        comment="Prazo final para conclusão da tarefa"
    )
    status: Mapped[StatusTarefa] = mapped_column(
        String(30), nullable=False, default=StatusTarefa.AGUARDANDO_ACEITE
    )
    tarefa_pai_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tarefas.id", ondelete="SET NULL"),
        nullable=True,
        comment="Tarefa pai para subtarefas"
    )
    data_aceite: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    data_entrega: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    data_conclusao: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    recorrente: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False,
        comment="Tarefa de acompanhamento recorrente"
    )
    intervalo_recorrencia_dias: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True,
        comment="Intervalo em dias para tarefas recorrentes"
    )

    # Relationships
    convenio: Mapped["Convenio"] = relationship("Convenio", back_populates="tarefas")
    etapa: Mapped["Etapa"] = relationship("Etapa", back_populates="tarefas")
    criada_por: Mapped["User"] = relationship("User", foreign_keys=[criada_por_id])
    atribuida_a: Mapped[Optional["User"]] = relationship(
        "User", foreign_keys=[atribuida_a_id]
    )
    setor_destino: Mapped[Optional["Setor"]] = relationship("Setor")
    tarefa_pai: Mapped[Optional["Tarefa"]] = relationship(
        "Tarefa", remote_side="Tarefa.id", back_populates="subtarefas"
    )
    subtarefas: Mapped[List["Tarefa"]] = relationship(
        "Tarefa", back_populates="tarefa_pai", cascade="all, delete-orphan"
    )
    anexos: Mapped[List["Anexo"]] = relationship(
        "Anexo", back_populates="tarefa", lazy="selectin",
        cascade="all, delete-orphan",
    )
    comentarios: Mapped[List["Comentario"]] = relationship(
        "Comentario", back_populates="tarefa", lazy="selectin",
        cascade="all, delete-orphan", order_by="Comentario.created_at",
    )
    contestacoes: Mapped[List["Contestacao"]] = relationship(
        "Contestacao", back_populates="tarefa", lazy="selectin",
        cascade="all, delete-orphan",
    )
    eventos: Mapped[List["EventoTimeline"]] = relationship(
        "EventoTimeline", back_populates="tarefa", lazy="selectin",
        cascade="all, delete-orphan", order_by="EventoTimeline.ocorrido_em",
    )
    notificacoes: Mapped[List["Notificacao"]] = relationship(
        "Notificacao", back_populates="tarefa", lazy="selectin",
        cascade="all, delete-orphan",
    )

    @property
    def atrasada(self) -> bool:
        """Calculado: tarefa está atrasada se ainda está aberta e passou do prazo."""
        if not StatusTarefa.is_aberta(self.status):
            return False
        if self.prazo is None:
            return False
        return datetime.now(timezone.utc) > self.prazo

    def __repr__(self) -> str:
        return f"<Tarefa {self.titulo} [{self.status.value}]>"
