import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin
from app.models.enums import StatusEntrega, TipoEntrega

if TYPE_CHECKING:
    from app.models.anexo import Anexo
    from app.models.convenio import Convenio
    from app.models.user import User


class EntregaObjeto(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "entregas_objetos"

    convenio_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("convenios.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    tipo: Mapped[TipoEntrega] = mapped_column(String(20), nullable=False, default=TipoEntrega.OUTRO)
    fornecedor: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    data_entrega: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    nota_fiscal: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    quantidade: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    identificacao: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    patrimonio: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    placa: Mapped[Optional[str]] = mapped_column(String(20), nullable=True, comment="Placa, se veículo")
    chassi: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    modelo: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    local_entrega: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    responsavel_recebimento_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    termo_recebimento: Mapped[Optional[bool]] = mapped_column(Boolean, default=False, nullable=False)
    observacao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[StatusEntrega] = mapped_column(
        String(30), nullable=False, default=StatusEntrega.REGISTRADA
    )

    # Relationships
    convenio: Mapped["Convenio"] = relationship("Convenio", back_populates="entregas")
    responsavel_recebimento: Mapped[Optional["User"]] = relationship(
        "User", foreign_keys=[responsavel_recebimento_id]
    )
    anexos: Mapped[list["Anexo"]] = relationship(
        "Anexo", back_populates="entrega", lazy="selectin",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<EntregaObjeto {self.identificacao or self.id} [{self.status.value}]>"
