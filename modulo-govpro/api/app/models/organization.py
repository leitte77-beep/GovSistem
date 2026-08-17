from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.models.base import Base, SoftDeleteMixin, TimestampMixin
from app.models.enums import EstrategiaNumeracao

if TYPE_CHECKING:
    from app.models.user import User


class Organization(Base, TimestampMixin, SoftDeleteMixin):
    """Ente = tenant. Espelho da `organizations` do SaaS + parâmetros institucionais.

    Guarda também os parâmetros que dependem de ato normativo local (decreto
    municipal instituindo o processo eletrônico, TTD, nível de assinatura por
    tipo de ato) — sinalizados no painel de administração.
    """

    __tablename__ = "organizations"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    cnpj: Mapped[Optional[str]] = mapped_column(String(18), unique=True, nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    logo_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    brasao_url: Mapped[Optional[str]] = mapped_column(
        String(500), nullable=True, comment="Brasão para cabeçalho/rodapé de documentos"
    )
    public_url: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # ── Parâmetros institucionais do processo eletrônico ──────────────────────
    estrategia_numeracao: Mapped[str] = mapped_column(
        String(30),
        default=EstrategiaNumeracao.NUP17.value,
        nullable=False,
    )
    fuso_horario: Mapped[str] = mapped_column(
        String(64),
        default="America/Sao_Paulo",
        nullable=False,
        comment="Horário oficial para prazos e protocolo (Brasília)",
    )
    possui_decreto_processo_eletronico: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        comment="Sinaliza dependência de ato normativo local (painel admin)",
    )
    settings: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    users: Mapped[List["User"]] = relationship(
        "User", back_populates="organization", lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<Organization {self.slug}>"
