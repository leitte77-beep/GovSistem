import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.models.enums import CanalNotificacao, StatusEnvio

if TYPE_CHECKING:
    from app.models.notificacao import Notificacao


class NotificacaoEnvio(Base, TimestampMixin):
    """Outbox de envio externo (§41, §126).

    O envio de e-mail não acontece no meio da operação que gerou o aviso: ela
    grava a linha e segue. Um processador pega os pendentes, tenta de novo com
    espera crescente e desiste depois do limite. É o que evita perder mensagem
    por uma queda momentânea de SMTP e o que impede uma varredura de prazos de
    travar esperando a rede.
    """

    __tablename__ = "notificacao_envios"
    __table_args__ = (
        UniqueConstraint("notificacao_id", "canal", name="uq_notificacao_envio_canal"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    notificacao_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("notificacoes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    canal: Mapped[CanalNotificacao] = mapped_column(String(10), nullable=False, default=CanalNotificacao.EMAIL)
    destinatario: Mapped[str] = mapped_column(String(255), nullable=False)
    assunto: Mapped[str] = mapped_column(String(255), nullable=False)
    corpo: Mapped[str] = mapped_column(Text, nullable=False)

    status: Mapped[StatusEnvio] = mapped_column(String(20), nullable=False, default=StatusEnvio.PENDENTE, index=True)
    tentativas: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    ultimo_erro: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    agendado_para: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    enviado_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    notificacao: Mapped["Notificacao"] = relationship("Notificacao")

    def __repr__(self) -> str:
        return f"<NotificacaoEnvio {self.canal} [{self.status.value}]>"
