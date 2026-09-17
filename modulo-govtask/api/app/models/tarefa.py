import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin
from app.models.enums import Prioridade, StatusTarefa, TipoTarefa

if TYPE_CHECKING:
    from app.models.anexo import Anexo
    from app.models.comentario import Comentario
    from app.models.contestacao import Contestacao
    from app.models.convenio import Convenio
    from app.models.demanda import Demanda
    from app.models.etapa import Etapa
    from app.models.evento_timeline import EventoTimeline
    from app.models.notificacao import Notificacao
    from app.models.setor import Setor
    from app.models.tarefa_dependencia import TarefaDependencia
    from app.models.tarefa_movimentacao import TarefaMovimentacao
    from app.models.tarefa_prazo_historico import TarefaPrazoHistorico
    from app.models.user import User


class Tarefa(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "tarefas"

    convenio_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("convenios.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    etapa_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("etapas.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
        comment="Etapa do fluxo; nulo em fluxo livre, quando a tarefa pende "
                "direto da demanda (§19)",
    )
    demanda_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("demandas.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
        comment="Demanda dona da tarefa (núcleo v2)",
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
    tipo: Mapped[TipoTarefa] = mapped_column(
        String(20), nullable=False, default=TipoTarefa.EXECUCAO, index=True,
        comment="Execução, aprovação, revisão ou pedido de informação",
    )
    setor_origem_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("setores.id", ondelete="SET NULL"),
        nullable=True,
        comment="Setor que encaminhou a tarefa — para onde ela volta ao concluir",
    )
    solicitante_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        comment="Quem pediu. Em pedido de informação (§23) continua responsável "
                "pela demanda enquanto outro setor apenas produz o que falta",
    )
    exige_retorno: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False,
        comment="Ao concluir, a tarefa volta para quem encaminhou (§20)",
    )
    exige_documento: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    exige_comentario: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    exige_aprovacao: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    permite_reencaminhar: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    motivo_devolucao: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="Justificativa da última devolução (§22)"
    )
    motivo_bloqueio: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    motivo_espera: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="De quem/do quê a tarefa está à espera"
    )
    resultado: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="O que foi feito, informado na conclusão"
    )
    concluida_por_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    ordem: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    prazo: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
        comment="Prazo final para conclusão da tarefa"
    )
    prazo_interno: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
        comment="Prazo interno definido pelo assessor (menor que o externo, para margem de revisão)"
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
    convenio: Mapped[Optional["Convenio"]] = relationship(
        "Convenio", back_populates="tarefas"
    )
    demanda: Mapped[Optional["Demanda"]] = relationship("Demanda")
    etapa: Mapped[Optional["Etapa"]] = relationship("Etapa", back_populates="tarefas")
    setor_origem: Mapped[Optional["Setor"]] = relationship(
        "Setor", foreign_keys=[setor_origem_id]
    )
    solicitante: Mapped[Optional["User"]] = relationship(
        "User", foreign_keys=[solicitante_id]
    )
    movimentacoes: Mapped[List["TarefaMovimentacao"]] = relationship(
        "TarefaMovimentacao", back_populates="tarefa", lazy="selectin",
        cascade="all, delete-orphan", order_by="TarefaMovimentacao.created_at",
    )
    criada_por: Mapped["User"] = relationship("User", foreign_keys=[criada_por_id])
    atribuida_a: Mapped[Optional["User"]] = relationship(
        "User", foreign_keys=[atribuida_a_id]
    )
    setor_destino: Mapped[Optional["Setor"]] = relationship(
        "Setor", foreign_keys=[setor_destino_id]
    )
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
    dependencias: Mapped[List["TarefaDependencia"]] = relationship(
        "TarefaDependencia", back_populates="tarefa", foreign_keys="TarefaDependencia.tarefa_id",
        lazy="selectin", cascade="all, delete-orphan",
    )
    dependentes: Mapped[List["TarefaDependencia"]] = relationship(
        "TarefaDependencia", back_populates="depende_de", foreign_keys="TarefaDependencia.depende_de_id",
        lazy="selectin", cascade="all, delete-orphan",
    )
    historico_prazos: Mapped[List["TarefaPrazoHistorico"]] = relationship(
        "TarefaPrazoHistorico", back_populates="tarefa", lazy="selectin",
        cascade="all, delete-orphan", order_by="TarefaPrazoHistorico.created_at",
    )

    @property
    def em_espera(self) -> bool:
        return StatusTarefa(self.status) in StatusTarefa.esperas()

    @property
    def bloqueada_por(self) -> list[str]:
        """Títulos das tarefas das quais esta depende e que ainda não foram concluídas."""
        nao_concluidas: list[str] = []
        for dep in self.dependencias:
            if dep.depende_de and dep.depende_de.status != "CONCLUIDA":
                nao_concluidas.append(dep.depende_de.titulo)
        return nao_concluidas

    @property
    def atrasada(self) -> bool:
        """Calculado: tarefa está atrasada se ainda está aberta e passou do prazo."""
        if not StatusTarefa.is_aberta(self.status):
            return False
        if self.prazo is None:
            return False
        prazo = self.prazo
        if prazo.tzinfo is None:
            prazo = prazo.replace(tzinfo=timezone.utc)
        return datetime.now(timezone.utc) > prazo

    def __repr__(self) -> str:
        return f"<Tarefa {self.titulo} [{self.status}]>"
