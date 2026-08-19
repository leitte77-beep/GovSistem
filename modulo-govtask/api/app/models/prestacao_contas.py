import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin
from app.models.enums import StatusPrestacao

if TYPE_CHECKING:
    from app.models.anexo import Anexo
    from app.models.convenio import Convenio
    from app.models.user import User


class PrestacaoContas(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "prestacoes_contas"

    convenio_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("convenios.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    titulo: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    status: Mapped[StatusPrestacao] = mapped_column(
        String(30), nullable=False, default=StatusPrestacao.EM_PREPARACAO
    )
    responsavel_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    data_envio: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    sistema_envio: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    protocolo: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    observacao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    parecer: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    data_aprovacao: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    convenio: Mapped["Convenio"] = relationship("Convenio", back_populates="prestacoes")
    responsavel: Mapped[Optional["User"]] = relationship("User", foreign_keys=[responsavel_id])
    itens: Mapped[list["PrestacaoItem"]] = relationship(
        "PrestacaoItem", back_populates="prestacao", lazy="selectin",
        cascade="all, delete-orphan",
    )
    anexos: Mapped[list["Anexo"]] = relationship(
        "Anexo", back_populates="prestacao", lazy="selectin",
        cascade="all, delete-orphan",
    )

    @property
    def percentual_preparacao(self) -> int:
        """Percentual de itens de checklist conferidos."""
        if not self.itens:
            return 0
        concluidos = sum(1 for i in self.itens if i.conferido)
        return round((concluidos / len(self.itens)) * 100)

    def __repr__(self) -> str:
        return f"<PrestacaoContas {self.id} [{self.status.value}]>"


class PrestacaoItem(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "prestacoes_contas_itens"

    prestacao_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("prestacoes_contas.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    descricao: Mapped[str] = mapped_column(String(300), nullable=False)
    conferido: Mapped[bool] = mapped_column(default=False, nullable=False)
    conferido_por_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    data_conferencia: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    prestacao: Mapped["PrestacaoContas"] = relationship("PrestacaoContas", back_populates="itens")
    conferido_por: Mapped[Optional["User"]] = relationship("User", foreign_keys=[conferido_por_id])

    def __repr__(self) -> str:
        return f"<PrestacaoItem {self.descricao[:40]} conferido={self.conferido}>"
