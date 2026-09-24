"""Notificações in-app.

O Assessor precisa saber quando um setor assume, transfere ou devolve um
pedido, ou pede complemento. Em vez de e-mail, o evento vira uma linha aqui
e aparece no sino da topbar. `lida_em` marca quando o destinatário abriu.
"""

import uuid
from datetime import datetime
from enum import Enum
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class TipoNotificacao(str, Enum):
    PEDIDO_ASSUMIDO = "PEDIDO_ASSUMIDO"
    PEDIDO_TRANSFERIDO = "PEDIDO_TRANSFERIDO"
    PEDIDO_DEVOLVIDO = "PEDIDO_DEVOLVIDO"
    COMPLEMENTO_SOLICITADO = "COMPLEMENTO_SOLICITADO"
    PRAZO_ALTERADO = "PRAZO_ALTERADO"
    MENCAO = "MENCAO"
    RESUMO_DIARIO = "RESUMO_DIARIO"
    TAREFA_RECEBIDA = "TAREFA_RECEBIDA"
    TAREFA_LIBERADA = "TAREFA_LIBERADA"


class Notificacao(Base, TimestampMixin):
    __tablename__ = "notificacoes"
    __table_args__ = (
        Index("ix_notificacoes_usuario_lida", "user_id", "lida_em"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    # Destinatário do aviso.
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    pedido_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pedidos.id", ondelete="CASCADE"),
        nullable=True,
    )
    encaminhamento_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("encaminhamentos.id", ondelete="CASCADE"),
        nullable=True,
    )

    tipo: Mapped[str] = mapped_column(String(32), nullable=False)
    texto: Mapped[str] = mapped_column(Text(), nullable=False)
    # Quem gerou o evento (o engenheiro que assumiu, transferiu ou devolveu).
    autor_nome: Mapped[str] = mapped_column(String(180), nullable=False, default="")
    lida_em: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
