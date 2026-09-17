"""Vínculos laterais entre demandas (§220).

Hierarquia pai/filha fica em `demandas.demanda_pai_id`; aqui moram as relações
que não estabelecem mando: relacionada, dependente e duplicada. Separar os dois
evita que "relacionada" seja lida como "subordinada" e mantém o cálculo de
progresso agregado restrito à árvore (§222).
"""

import uuid
from typing import TYPE_CHECKING, Optional

from sqlalchemy import CheckConstraint, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin
from app.models.enums import TipoRelacionamentoDemanda

if TYPE_CHECKING:
    from app.models.demanda import Demanda
    from app.models.user import User


class DemandaRelacionamento(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "demanda_relacionamentos"
    __table_args__ = (
        UniqueConstraint(
            "demanda_id", "relacionada_id", "tipo",
            name="uq_demanda_relacionamento",
        ),
        CheckConstraint(
            "demanda_id <> relacionada_id",
            name="ck_relacionamento_nao_self",
        ),
        Index("ix_demanda_relacionamentos_org", "organization_id"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    demanda_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("demandas.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="Demanda dona do vínculo",
    )
    relacionada_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("demandas.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="A outra ponta do vínculo",
    )
    tipo: Mapped[TipoRelacionamentoDemanda] = mapped_column(
        String(20), nullable=False, default=TipoRelacionamentoDemanda.RELACIONADA
    )
    descricao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    criado_por_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )

    relacionada: Mapped["Demanda"] = relationship(
        "Demanda", foreign_keys=[relacionada_id], lazy="selectin"
    )
    criado_por: Mapped["User"] = relationship("User", foreign_keys=[criado_por_id])
