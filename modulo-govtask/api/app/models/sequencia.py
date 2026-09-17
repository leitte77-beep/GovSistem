"""Numeração sequencial de demandas (§123).

A numeração é por tenant e por exercício. O contador vive em uma linha própria
travada com `SELECT ... FOR UPDATE` dentro da transação que cria a demanda, o
que impede número duplicado sob concorrência — e, diferente de uma SEQUENCE do
Postgres, permite reiniciar a cada ano e configurar o formato por organização.
"""

import uuid

from sqlalchemy import BigInteger, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class SequenciaNumeracao(Base, TimestampMixin):
    __tablename__ = "sequencias_numeracao"
    __table_args__ = (
        UniqueConstraint(
            "organization_id", "escopo", "exercicio", name="uq_sequencia_org_escopo_ano"
        ),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    escopo: Mapped[str] = mapped_column(
        String(40), nullable=False, default="DEMANDA",
        comment="Que numeração este contador controla (DEMANDA, PROTOCOLO, ...)",
    )
    exercicio: Mapped[int] = mapped_column(Integer, nullable=False)
    ultimo_numero: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)

    def __repr__(self) -> str:
        return f"<Sequencia {self.escopo}/{self.exercicio}={self.ultimo_numero}>"
