import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class ReceptionLog(Base, TimestampMixin):
    """Fila/triagem da recepção.

    IMPORTANTE (regra do RMA): recepção/triagem NÃO é atendimento. Por isso é
    modelada em tabela separada e nunca alimenta as contagens de atendimento.
    """

    __tablename__ = "reception_log"
    __table_args__ = (
        Index("ix_reception_tenant_unit_data", "tenant_id", "unit_id", "data"),
        Index("ix_reception_tenant_status", "tenant_id", "status"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    unit_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("units.id", ondelete="CASCADE"),
        nullable=False,
    )
    data: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.utcnow()
    )
    # Pessoa/família podem ainda não estar cadastradas — campos opcionais.
    person_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("persons.id", ondelete="SET NULL"),
        nullable=True,
    )
    family_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("families.id", ondelete="SET NULL"),
        nullable=True,
    )
    nome_informado: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    motivo: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="AGUARDANDO"
    )
    senha: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    atendido_em: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    def __repr__(self) -> str:
        return f"<ReceptionLog {self.status} unit={self.unit_id}>"
