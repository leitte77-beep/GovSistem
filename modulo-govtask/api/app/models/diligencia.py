import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin
from app.models.enums import OrigemDiligencia, StatusDiligencia

if TYPE_CHECKING:
    from app.models.anexo import Anexo
    from app.models.convenio import Convenio
    from app.models.etapa import Etapa
    from app.models.tarefa import Tarefa
    from app.models.user import User


class Diligencia(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "diligencias"

    convenio_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("convenios.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    origem: Mapped[OrigemDiligencia] = mapped_column(
        String(30), nullable=False, default=OrigemDiligencia.GOVERNO_FEDERAL
    )
    origem_descricao: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True, comment="Órgão/entidade que originou a diligência"
    )
    data_recebimento: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    protocolo: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    descricao: Mapped[str] = mapped_column(Text, nullable=False)
    prazo: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True,
        comment="Prazo concedido para atendimento",
    )
    responsavel_id: Mapped[Optional[uuid.UUID]] = mapped_column(
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
    status: Mapped[StatusDiligencia] = mapped_column(
        String(30), nullable=False, default=StatusDiligencia.RECEBIDA
    )
    tarefa_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tarefas.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        comment="Tarefa vinculada (opcional)",
    )
    etapa_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("etapas.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        comment="Etapa vinculada (opcional)",
    )
    resposta_interna: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="Resposta elaborada internamente"
    )
    resposta_data: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    resposta_protocolo: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True,
        comment="Protocolo do envio da resposta ao órgão externo",
    )
    data_encerramento: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    convenio: Mapped["Convenio"] = relationship("Convenio", back_populates="diligencias")
    responsavel: Mapped[Optional["User"]] = relationship(
        "User", foreign_keys=[responsavel_id]
    )
    tarefa: Mapped[Optional["Tarefa"]] = relationship("Tarefa", foreign_keys=[tarefa_id])
    etapa: Mapped[Optional["Etapa"]] = relationship("Etapa", foreign_keys=[etapa_id])
    anexos: Mapped[list["Anexo"]] = relationship(
        "Anexo", back_populates="diligencia", lazy="selectin",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<Diligencia {self.descricao[:40]} [{self.status.value}]>"
