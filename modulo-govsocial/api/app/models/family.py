import uuid
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import (
    Boolean,
    Date,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.models.base import Base, SoftDeleteMixin, TimestampMixin

if TYPE_CHECKING:
    from app.models.person import Person
    from app.models.person_family_membership import PersonFamilyMembership


class Family(Base, TimestampMixin, SoftDeleteMixin):
    """Família — unidade de trabalho do SUAS."""

    __tablename__ = "families"
    __table_args__ = (
        # Código sequencial por tenant.
        UniqueConstraint("tenant_id", "codigo", name="uq_family_tenant_codigo"),
        Index("ix_families_tenant_codigo", "tenant_id", "codigo"),
        Index("ix_families_tenant_territorio", "tenant_id", "territorio"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    codigo: Mapped[int] = mapped_column(
        Integer, nullable=False, comment="Código sequencial por tenant"
    )

    # Responsável familiar (RF): referência à Person, resolvida após criação.
    responsavel_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("persons.id", ondelete="SET NULL"),
        nullable=True,
    )
    nis_responsavel: Mapped[Optional[str]] = mapped_column(
        String(11), nullable=True, comment="NIS do responsável (somente dígitos)"
    )

    # Endereço estruturado + geocodificação (fila assíncrona).
    cep: Mapped[Optional[str]] = mapped_column(String(8), nullable=True)
    logradouro: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    numero: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    complemento: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    bairro: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    municipio: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    uf: Mapped[Optional[str]] = mapped_column(String(2), nullable=True)
    latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    geocode_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="PENDENTE",
        comment="PENDENTE | PROCESSANDO | OK | FALHOU | SEM_ENDERECO",
    )
    territorio: Mapped[Optional[str]] = mapped_column(
        String(120), nullable=True, comment="Bairro/território calculado"
    )

    faixa_renda: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    # Marcações socioassistenciais.
    no_cadunico: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False,
        comment="Família não está no CadÚnico",
    )
    cadunico_atualizado_em: Mapped[Optional[str]] = mapped_column(
        Date, nullable=True
    )
    beneficiaria_pbf: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    possui_bpc: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    inseguranca_alimentar: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )

    observacoes: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    responsavel: Mapped[Optional["Person"]] = relationship(
        "Person", foreign_keys=[responsavel_id]
    )
    memberships: Mapped[List["PersonFamilyMembership"]] = relationship(
        "PersonFamilyMembership",
        back_populates="family",
        lazy="selectin",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<Family {self.codigo}>"
