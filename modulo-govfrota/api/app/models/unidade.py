import uuid
from typing import Optional

from sqlalchemy import Boolean, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, SoftDeleteMixin, TimestampMixin


class Unidade(Base, TimestampMixin, SoftDeleteMixin):
    """Lotação da frota: secretaria (órgão público) ou centro de custo (empresa).

    Veículos pertencem a uma unidade; abastecimentos e manutenções gravam a
    unidade do veículo no momento do lançamento, para que o relatório por
    secretaria não mude quando um veículo é transferido.
    """

    __tablename__ = "unidades"
    __table_args__ = (Index("ix_unidades_org_nome", "organization_id", "nome"),)

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    nome: Mapped[str] = mapped_column(String(150), nullable=False)
    sigla: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean(), default=True, nullable=False)
