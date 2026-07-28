import uuid
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin

if TYPE_CHECKING:
    from app.models.professional_assignment import ProfessionalAssignment


class Professional(Base, TimestampMixin, SoftDeleteMixin):
    """Profissional (pessoa física) da equipe SUAS conforme NOB-RH."""

    __tablename__ = "professionals"
    __table_args__ = (
        # CPF único por tenant, nunca chave exposta (LGPD).
        UniqueConstraint("tenant_id", "cpf", name="uq_professional_tenant_cpf"),
        Index("ix_professionals_tenant_nome", "tenant_id", "nome"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    nome: Mapped[str] = mapped_column(String(255), nullable=False)
    cpf: Mapped[str] = mapped_column(
        String(11), nullable=False, comment="Somente dígitos; único por tenant"
    )
    funcao_nob_rh: Mapped[Optional[str]] = mapped_column(
        String(120), nullable=True, comment="Função conforme NOB-RH/SUAS"
    )
    conselho_classe_tipo: Mapped[Optional[str]] = mapped_column(
        String(20), nullable=True, comment="Ex.: CRESS, CRP"
    )
    conselho_classe_numero: Mapped[Optional[str]] = mapped_column(
        String(30), nullable=True
    )
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    telefone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    # Vínculo opcional com um usuário de login da plataforma.
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    assignments: Mapped[List["ProfessionalAssignment"]] = relationship(
        "ProfessionalAssignment",
        back_populates="professional",
        lazy="selectin",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<Professional {self.nome}>"
