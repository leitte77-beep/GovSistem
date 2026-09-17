"""Conversa interna da Demanda, com menções, respostas e histórico (§42, §43).

Comentário é **comunicação**, não auditoria: pode ser editado e fixado por quem
tem permissão. Para que a edição não apague o que foi dito, cada alteração
guarda o texto anterior em `comentario_revisoes` — a timeline segue sendo a
fonte oficial dos fatos, e o comentário, do diálogo.
"""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin

if TYPE_CHECKING:
    from app.models.demanda import Demanda
    from app.models.user import User


class ComentarioDemanda(Base, TimestampMixin, SoftDeleteMixin):
    """Comentário de uma demanda (opcionalmente amarrado a uma tarefa dela)."""

    __tablename__ = "comentarios_demanda"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    demanda_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("demandas.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    tarefa_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tarefas.id", ondelete="CASCADE"), nullable=True
    )
    # Resposta a outro comentário do mesmo tópico (§42).
    responde_a_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("comentarios_demanda.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    autor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    texto: Mapped[str] = mapped_column(Text, nullable=False)
    fixado: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    editado_em: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    autor: Mapped["User"] = relationship("User", lazy="selectin")
    demanda: Mapped["Demanda"] = relationship("Demanda")
    revisoes: Mapped[List["ComentarioRevisao"]] = relationship(
        "ComentarioRevisao",
        back_populates="comentario",
        cascade="all, delete-orphan",
        order_by="ComentarioRevisao.created_at",
    )
    mencoes: Mapped[List["ComentarioMencao"]] = relationship(
        "ComentarioMencao",
        back_populates="comentario",
        lazy="selectin",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<ComentarioDemanda {self.id} demanda={self.demanda_id}>"


class ComentarioRevisao(Base, TimestampMixin):
    """Texto anterior de um comentário editado. Append-only."""

    __tablename__ = "comentario_revisoes"

    comentario_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("comentarios_demanda.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    texto_anterior: Mapped[str] = mapped_column(Text, nullable=False)
    editado_por_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )

    comentario: Mapped["ComentarioDemanda"] = relationship(
        "ComentarioDemanda", back_populates="revisoes"
    )


class ComentarioMencao(Base, TimestampMixin):
    """Usuário citado por @menção em um comentário.

    A tabela existe para que a menção seja um fato consultável ("onde fui
    citado?") em vez de um resultado de regex sobre o texto a cada leitura.
    """

    __tablename__ = "comentario_mencoes"

    comentario_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("comentarios_demanda.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    lido_em: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    comentario: Mapped["ComentarioDemanda"] = relationship(
        "ComentarioDemanda", back_populates="mencoes"
    )
