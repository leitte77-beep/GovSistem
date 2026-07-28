"""Teleatendimento WebRTC — Fase 3.14."""

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, SoftDeleteMixin


class Teleatendimento(Base, TimestampMixin):
    """Sessao de teleatendimento por videochamada (CCCXVIII-CCCXXVIII)."""

    __tablename__ = "teleatendimentos"

    id: Mapped[str] = mapped_column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    tenant_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    unit_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False)
    profissional_id: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=True), nullable=True)
    person_id: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=True), nullable=True)
    sala_id: Mapped[str] = mapped_column(String(36), unique=True, nullable=False, comment="UUID unico da sala")
    codigo_acesso: Mapped[str] = mapped_column(String(10), nullable=False, comment="Codigo de 6 digitos")
    link: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="AGUARDANDO", comment="AGUARDANDO | EM_ANDAMENTO | CONCLUIDO | CANCELADO")
    aceite_termo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    observacoes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    attendance_id: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=True), nullable=True)
    registrado_por_id: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=True), nullable=True)
