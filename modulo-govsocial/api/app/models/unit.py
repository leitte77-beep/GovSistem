import uuid
from typing import Optional

from sqlalchemy import Boolean, Float, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.models.base import Base, SoftDeleteMixin, TimestampMixin


class Unit(Base, TimestampMixin, SoftDeleteMixin):
    """Unidade da rede SUAS (CRAS, CREAS, Centro POP, acolhimento, sede, rede)."""

    __tablename__ = "units"
    __table_args__ = (
        Index("ix_units_tenant_tipo", "tenant_id", "tipo"),
        Index("ix_units_tenant_nome", "tenant_id", "nome"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    tipo: Mapped[str] = mapped_column(String(20), nullable=False)
    nome: Mapped[str] = mapped_column(String(255), nullable=False)
    cnpj: Mapped[Optional[str]] = mapped_column(String(18), nullable=True)
    telefone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # Endereço estruturado.
    cep: Mapped[Optional[str]] = mapped_column(String(8), nullable=True)
    logradouro: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    numero: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    complemento: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    bairro: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    municipio: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    uf: Mapped[Optional[str]] = mapped_column(String(2), nullable=True)
    latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Bairros/territórios de abrangência (lista).
    territorios: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    def __repr__(self) -> str:
        return f"<Unit {self.tipo}:{self.nome}>"
