"""Filtros e visões pessoais salvas (§49, §50).

A visão guarda apenas o conjunto de filtros — nunca o resultado. Assim uma
visão criada por alguém que depois perde acesso a demandas sigilosas continua
válida e simplesmente devolve menos linhas: o escopo é reavaliado a cada
consulta, e não congelado no momento em que a visão foi salva.
"""

import uuid
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, ForeignKey, JSON, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin

if TYPE_CHECKING:
    from app.models.user import User


class VisaoSalva(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "visoes_salvas"
    __table_args__ = (
        UniqueConstraint(
            "organization_id", "user_id", "nome", name="uq_visao_org_user_nome"
        ),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Dono da visão. Visões compartilhadas continuam tendo dono: quem criou é
    # quem pode alterá-la, ainda que a organização inteira a use.
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    nome: Mapped[str] = mapped_column(String(120), nullable=False)
    descricao: Mapped[Optional[str]] = mapped_column(String(400), nullable=True)
    recurso: Mapped[str] = mapped_column(
        String(20), nullable=False, default="DEMANDAS", index=True
    )
    filtros: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    # Modo de exibição preferido da visão: LISTA, CARDS, KANBAN, CALENDARIO.
    layout: Mapped[str] = mapped_column(String(20), nullable=False, default="LISTA")
    compartilhada: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, index=True
    )
    padrao: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    dono: Mapped["User"] = relationship("User", lazy="selectin")

    def __repr__(self) -> str:
        return f"<VisaoSalva {self.nome}>"
