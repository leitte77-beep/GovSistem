import uuid
from datetime import date
from typing import Optional

from sqlalchemy import (
    Date,
    ForeignKey,
    Index,
    String,
    BigInteger,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin


class Ocorrencia(Base, TimestampMixin, SoftDeleteMixin):
    """Problemas/ocorrências registrados por administrador ou motorista."""

    __tablename__ = "ocorrencias"
    __table_args__ = (
        Index("ix_ocorr_org_gravidade", "organization_id", "gravidade"),
        Index("ix_ocorr_veiculo", "veiculo_id"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    veiculo_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("veiculos.id"), nullable=False
    )
    motorista_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("motoristas.id"), nullable=True
    )
    categoria: Mapped[str] = mapped_column(String(40), nullable=False)
    descricao: Mapped[str] = mapped_column(Text(), nullable=False)
    quilometragem: Mapped[Optional[int]] = mapped_column(BigInteger(), nullable=True)
    gravidade: Mapped[str] = mapped_column(String(15), default="MEDIA", nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="ABERTA", nullable=False)
    foto_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    data_ocorrencia: Mapped[date] = mapped_column(Date(), nullable=False)
    manutencao_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("manutencoes.id"), nullable=True
    )
    origem: Mapped[str] = mapped_column(String(20), default="ADMIN", nullable=False)

    veiculo: Mapped["Veiculo"] = relationship()
