"""Webhooks de saída (§196).

A arquitetura é deliberadamente separada em duas etapas: o evento **enfileira**
uma entrega na transação da timeline, sem tocar na rede; um processador
explícito/assíncrono tenta a entrega e registra o resultado. Assim uma
instabilidade do destino nunca faz a demanda falhar, e a retentativa é
idempotente porque só reprocessa o que ainda não teve sucesso.
"""

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, JSON, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin
from app.models.enums import StatusWebhookEntrega


class WebhookEndpoint(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "webhook_endpoints"
    __table_args__ = (Index("ix_webhook_endpoints_org", "organization_id"),)

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    url: Mapped[str] = mapped_column(String(500), nullable=False)
    descricao: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    secret: Mapped[str] = mapped_column(
        String(128), nullable=False,
        comment="Segredo de assinatura HMAC-SHA256; devolvido apenas na criação",
    )
    eventos: Mapped[Optional[list]] = mapped_column(
        JSON, nullable=True,
        comment="Lista de tipos de evento assinados; vazio/nulo assina todos",
    )
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    ultima_entrega_em: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    ultimo_status: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    entregas: Mapped[list["WebhookEntrega"]] = relationship(
        "WebhookEntrega", back_populates="endpoint", cascade="all, delete-orphan"
    )


class WebhookEntrega(Base, TimestampMixin):
    __tablename__ = "webhook_entregas"
    __table_args__ = (
        Index("ix_webhook_entregas_endpoint", "endpoint_id", "status"),
        Index("ix_webhook_entregas_org", "organization_id"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    endpoint_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("webhook_endpoints.id", ondelete="CASCADE"),
        nullable=False,
    )
    evento: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    demanda_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("demandas.id", ondelete="SET NULL"), nullable=True
    )
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    status: Mapped[StatusWebhookEntrega] = mapped_column(
        String(20), nullable=False, default=StatusWebhookEntrega.PENDENTE
    )
    tentativas: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    http_status: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    resposta: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    erro: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    entregue_em: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    endpoint: Mapped["WebhookEndpoint"] = relationship(
        "WebhookEndpoint", back_populates="entregas"
    )
