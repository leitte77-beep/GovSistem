import uuid
from typing import Optional

from sqlalchemy import Boolean, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, SoftDeleteMixin, TimestampMixin


class EscalonamentoConfig(Base, TimestampMixin, SoftDeleteMixin):
    """Configuração de escalonamento de atrasos por organização (§59)."""

    __tablename__ = "escalonamento_config"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        primary_key=True,
    )
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # Dias de atraso que disparam cada nível de escalonamento
    dia_responsavel: Mapped[int] = mapped_column(
        Integer, default=1, nullable=False,
        comment="Dias de atraso para notificar o responsável (nível 1)",
    )
    dia_coordenador: Mapped[int] = mapped_column(
        Integer, default=3, nullable=False,
        comment="Dias de atraso para notificar o coordenador (nível 2)",
    )
    dia_gestor: Mapped[int] = mapped_column(
        Integer, default=5, nullable=False,
        comment="Dias de atraso para notificar o gestor (nível 3)",
    )


class EscalamentoAtraso(Base, TimestampMixin, SoftDeleteMixin):
    """Registro de níveis de escalonamento já disparados por tarefa.

    Evita reenviar notificações no mesmo nível para a mesma tarefa.
    """

    __tablename__ = "escalonamento_atrasos"
    __table_args__ = (UniqueConstraint("tarefa_id", "nivel", name="uq_escalonamento_tarefa_nivel"),)

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    tarefa_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tarefas.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    nivel: Mapped[int] = mapped_column(
        Integer, nullable=False, comment="Nível de escalonamento disparado (1, 2 ou 3)"
    )
