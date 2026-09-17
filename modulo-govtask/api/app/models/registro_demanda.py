import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, JSON, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base, TimestampMixin

class RegistroDemanda(Base, TimestampMixin):
    """Contato, reunião ou acompanhamento: fatos auditáveis da demanda."""
    __tablename__ = "demanda_registros"
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    demanda_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("demandas.id", ondelete="CASCADE"), nullable=False, index=True)
    tipo: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    ocorrido_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    resumo: Mapped[str] = mapped_column(Text, nullable=False)
    contato: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    proxima_acao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    proximo_followup: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    participantes: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    decisoes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    metadados: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    registrado_por_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
