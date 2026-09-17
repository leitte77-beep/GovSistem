"""Registro de cada vez que uma tarefa muda de mãos (§20, §21, §22).

Guardar a movimentação em tabela própria — e não só como evento de texto na
timeline — é o que permite medir o que a gestão precisa saber: quanto tempo
cada departamento ficou com a demanda, quanto demorou até alguém ler a tarefa,
e quantas vezes ela voltou para correção.

Append-only: nada aqui é editado depois de gravado.
"""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.models.enums import TipoMovimentacaoTarefa

if TYPE_CHECKING:
    from app.models.demanda import Demanda
    from app.models.setor import Setor
    from app.models.tarefa import Tarefa
    from app.models.user import User


class TarefaMovimentacao(Base, TimestampMixin):
    __tablename__ = "tarefa_movimentacoes"

    tarefa_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tarefas.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    demanda_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("demandas.id", ondelete="CASCADE"),
        nullable=True, index=True,
    )
    tipo: Mapped[TipoMovimentacaoTarefa] = mapped_column(
        String(30), nullable=False, index=True
    )

    de_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    de_setor_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("setores.id", ondelete="SET NULL"), nullable=True
    )
    para_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )
    para_setor_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("setores.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )

    motivo: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    prazo: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    exige_retorno: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    registrado_por_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    recebido_em: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True,
        comment="Quando o destinatário aceitou/leu — mede o tempo até a leitura (§21)",
    )
    encerrado_em: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True,
        comment="Quando esta passagem terminou (nova movimentação ou conclusão)",
    )

    tarefa: Mapped["Tarefa"] = relationship("Tarefa", back_populates="movimentacoes")
    demanda: Mapped[Optional["Demanda"]] = relationship("Demanda")
    de_user: Mapped[Optional["User"]] = relationship("User", foreign_keys=[de_user_id])
    para_user: Mapped[Optional["User"]] = relationship(
        "User", foreign_keys=[para_user_id], lazy="selectin"
    )
    de_setor: Mapped[Optional["Setor"]] = relationship("Setor", foreign_keys=[de_setor_id])
    para_setor: Mapped[Optional["Setor"]] = relationship(
        "Setor", foreign_keys=[para_setor_id], lazy="selectin"
    )
    registrado_por: Mapped["User"] = relationship(
        "User", foreign_keys=[registrado_por_id]
    )

    def __repr__(self) -> str:
        return f"<TarefaMovimentacao {self.tipo} tarefa={self.tarefa_id}>"
