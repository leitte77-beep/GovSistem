import uuid
from datetime import date
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import (
    Boolean,
    Date,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.models.base import Base, SoftDeleteMixin, TimestampMixin

if TYPE_CHECKING:
    from app.models.person_family_membership import PersonFamilyMembership


class Person(Base, TimestampMixin, SoftDeleteMixin):
    """Pessoa/membro. Nome social tem precedência de exibição quando preenchido."""

    __tablename__ = "persons"
    __table_args__ = (
        # CPF e NIS são atributos únicos por tenant (LGPD), nunca chave exposta.
        UniqueConstraint("tenant_id", "cpf", name="uq_person_tenant_cpf"),
        UniqueConstraint("tenant_id", "nis", name="uq_person_tenant_nis"),
        Index("ix_persons_tenant_busca", "tenant_id", "busca"),
        Index("ix_persons_tenant_nasc", "tenant_id", "data_nascimento"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    nome_civil: Mapped[str] = mapped_column(String(255), nullable=False)
    nome_social: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    # Coluna desnormalizada para busca tolerante a acento (nome civil + social).
    busca: Mapped[Optional[str]] = mapped_column(String(600), nullable=True)

    cpf: Mapped[Optional[str]] = mapped_column(String(11), nullable=True)
    nis: Mapped[Optional[str]] = mapped_column(String(11), nullable=True)

    data_nascimento: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    sexo: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    escolaridade: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    ocupacao: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)

    tipo_deficiencia: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    # Detalhe de saúde/deficiência é sensível → criptografado em repouso.
    deficiencia_detalhe_enc: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True
    )

    documentos: Mapped[Optional[dict]] = mapped_column(
        JSON, nullable=True,
        comment="rg, orgao_emissor, titulo_eleitor, ctps, certidao, etc.",
    )

    is_falecido: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    memberships: Mapped[List["PersonFamilyMembership"]] = relationship(
        "PersonFamilyMembership",
        back_populates="person",
        lazy="selectin",
        cascade="all, delete-orphan",
        foreign_keys="PersonFamilyMembership.person_id",
    )

    @property
    def nome_exibicao(self) -> str:
        return self.nome_social or self.nome_civil

    def __repr__(self) -> str:
        return f"<Person {self.nome_exibicao}>"
