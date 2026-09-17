"""Participantes e seguidores de uma demanda (§45, §46, §75, §76)."""

import uuid
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.models.enums import PapelParticipante

if TYPE_CHECKING:
    from app.models.demanda import Demanda
    from app.models.setor import Setor
    from app.models.user import User


class DemandaParticipante(Base, TimestampMixin):
    """Quem participa da demanda e em que papel.

    Distinguir papéis evita o problema clássico de "perder a responsabilidade":
    um setor que apenas colabora entra como COLABORADOR, sem tomar do
    responsável geral a titularidade da demanda (§24).
    """

    __tablename__ = "demanda_participantes"
    __table_args__ = (
        UniqueConstraint(
            "demanda_id", "user_id", "papel", name="uq_demanda_participante"
        ),
    )

    demanda_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("demandas.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    setor_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("setores.id", ondelete="SET NULL"), nullable=True
    )
    papel: Mapped[PapelParticipante] = mapped_column(
        String(20), nullable=False, default=PapelParticipante.COLABORADOR
    )
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    adicionado_por_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    demanda: Mapped["Demanda"] = relationship("Demanda", back_populates="participantes")
    user: Mapped["User"] = relationship("User", foreign_keys=[user_id], lazy="selectin")
    setor: Mapped[Optional["Setor"]] = relationship("Setor")


class DemandaSeguidor(Base, TimestampMixin):
    """Usuário que optou por acompanhar a demanda e receber atualizações."""

    __tablename__ = "demanda_seguidores"
    __table_args__ = (
        UniqueConstraint("demanda_id", "user_id", name="uq_demanda_seguidor"),
    )

    demanda_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("demandas.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    favorito: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False,
        comment="Favoritar (§45) é seguir + fixar na lista pessoal",
    )

    demanda: Mapped["Demanda"] = relationship("Demanda", back_populates="seguidores")
    user: Mapped["User"] = relationship("User")
