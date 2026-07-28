from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.models.base import Base, SoftDeleteMixin, TimestampMixin

if TYPE_CHECKING:
    from app.models.user import User


class Organization(Base, TimestampMixin, SoftDeleteMixin):
    """Tenant = município. Guarda também os parâmetros de negócio por tenant."""

    __tablename__ = "organizations"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(
        String(100), unique=True, nullable=False, index=True
    )
    cnpj: Mapped[Optional[str]] = mapped_column(String(18), unique=True, nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    logo_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    brasao_url: Mapped[Optional[str]] = mapped_column(
        String(500), nullable=True, comment="Brasão do município para comprovantes/PDF"
    )
    theme_config: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    public_url: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # Parâmetros de sigilo/negócio por tenant (LGPD / política municipal).
    settings: Mapped[Optional[dict]] = mapped_column(
        JSON,
        nullable=True,
        comment=(
            "Config por tenant: gestor_le_evolucao(bool), textos de comprovante, "
            "parâmetros de sigilo, janelas de antiduplicidade, etc."
        ),
    )
    # Consentimento do tenant para acesso do suporte GovSocial (trilha reforçada).
    suporte_consentido: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    users: Mapped[List["User"]] = relationship(
        "User", back_populates="organization", lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<Organization {self.slug}>"
