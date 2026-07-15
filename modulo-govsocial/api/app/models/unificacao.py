"""Unificacao de registros duplicados — Fase 3.15."""

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.dialects.postgresql import UUID, JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class UnificacaoLog(Base, TimestampMixin):
    """Historico de unificacoes realizadas (CCCXLVII)."""

    __tablename__ = "unificacoes_log"

    id: Mapped[str] = mapped_column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    tenant_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    tabela: Mapped[str] = mapped_column(String(50), nullable=False)
    registro_mantido_id: Mapped[str] = mapped_column(String(36), nullable=False)
    registros_excluidos: Mapped[list] = mapped_column(JSON, nullable=False, comment="Lista de UUIDs excluidos")
    realizado_por_id: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=True), nullable=True)
