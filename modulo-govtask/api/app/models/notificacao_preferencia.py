import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, JSON, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.user import User


class NotificacaoPreferencia(Base, TimestampMixin):
    """Preferências de notificação do usuário (§41).

    O canal in-app é sempre gravado — não há como desligá-lo, porque é o
    registro que sustenta o sino e a auditoria da comunicação. O que o usuário
    decide é se quer *também* receber e-mail, e para quais tipos.
    """

    __tablename__ = "notificacao_preferencias"
    __table_args__ = (
        UniqueConstraint("user_id", name="uq_notificacao_preferencia_user"),
    )

    # A restrição única já indexa `user_id`; um índice extra seria redundante.
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    email_ativo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    tipos_email: Mapped[list] = mapped_column(
        JSON, default=list, nullable=False,
        comment="Tipos que geram e-mail; vazio = todos os tipos",
    )

    user: Mapped["User"] = relationship("User")

    def __repr__(self) -> str:
        return f"<NotificacaoPreferencia user={self.user_id} email={self.email_ativo}>"
