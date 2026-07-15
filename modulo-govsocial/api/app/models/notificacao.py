"""Notificações internas do sistema."""
import uuid
from typing import Optional

from sqlalchemy import Boolean, ForeignKey, JSON, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class Notificacao(Base, TimestampMixin):
    """Notificacao interna do sistema para um usuario."""

    __tablename__ = "notificacoes"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    titulo: Mapped[str] = mapped_column(String(255), nullable=False)
    mensagem: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tipo: Mapped[str] = mapped_column(
        String(30), nullable=False,
        comment="ENCAMINHAMENTO | AGENDA | BENEFICIO | PRAZO | ALERTA | SISTEMA"
    )
    lida: Mapped[bool] = mapped_column(default=False)
    role_alvo: Mapped[Optional[str]] = mapped_column(
        String(30), nullable=True, index=True,
        comment="Papel alvo (null = todos). ADMIN, gestor_municipal, tecnico_superior, tecnico_medio, coordenador_unidade, recepcao, vigilancia, conselho"
    )
    link: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    entity_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    entity_id: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)


class FiltroSalvo(Base, TimestampMixin):
    """Filtro personalizado salvo pelo usuario."""

    __tablename__ = "filtros_salvos"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    entidade: Mapped[str] = mapped_column(
        String(30), nullable=False,
        comment="families | persons | attendances | benefits | groups | acompanhamentos"
    )
    nome: Mapped[str] = mapped_column(String(120), nullable=False)
    configuracao: Mapped[dict] = mapped_column(
        JSON, nullable=False, comment="Campos e valores do filtro"
    )
    compartilhado: Mapped[bool] = mapped_column(
        default=False, comment="Visivel para todos da unidade"
    )
