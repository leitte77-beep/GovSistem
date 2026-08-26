import uuid
from datetime import date, datetime
from typing import Optional

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship, validates

from app.models.base import Base, SoftDeleteMixin, TimestampMixin


class Motorista(Base, TimestampMixin, SoftDeleteMixin):
    """Motorista — NÃO é usuário do SaaS; consome apenas acesso próprio ao GovFrota."""

    __tablename__ = "motoristas"
    __table_args__ = (
        Index("ix_motoristas_org_cpf", "organization_id", "cpf", "deleted_at"),
        UniqueConstraint(
            "organization_id",
            "cpf",
            "deleted_at",
            name="uq_motorista_org_cpf",
        ),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    nome: Mapped[str] = mapped_column(String(255), nullable=False)
    cpf: Mapped[str] = mapped_column(String(14), nullable=False, index=True)
    matricula: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    telefone: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    cnh_numero: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    cnh_categoria: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)
    cnh_validade: Mapped[Optional[date]] = mapped_column(Date(), nullable=True)
    observacoes: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    foto_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean(), default=True, nullable=False)

    acesso: Mapped[Optional["AcessoMotorista"]] = relationship(
        back_populates="motorista", uselist=False, cascade="all, delete-orphan"
    )


class AcessoMotorista(Base, TimestampMixin):
    """Credencial de login do motorista (DriverCredential).

    PIN/senha sempre armazenados com hash bcrypt. Nunca em texto puro.
    """

    __tablename__ = "acessos_motorista"
    __table_args__ = (
        # Login globalmente único no GovFrota (case-insensitive, normalizado).
        # A tela do motorista NÃO solicita tenant; logo, a unicidade deve ser
        # global e garantida pelo banco, não apenas pela aplicação.
        UniqueConstraint("login_normalized", name="uq_acessos_login_normalized"),
        CheckConstraint("login_normalized = lower(login)", name="ck_acesso_login_normalizado"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    motorista_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("motoristas.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    login: Mapped[str] = mapped_column(String(60), nullable=False)
    login_normalized: Mapped[str] = mapped_column(String(60), nullable=False)
    senha_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    bloqueado: Mapped[bool] = mapped_column(Boolean(), default=False, nullable=False)
    falhas_login: Mapped[int] = mapped_column(default=0, nullable=False)
    locked_until: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    ultimo_acesso: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    motorista: Mapped["Motorista"] = relationship(back_populates="acesso")

    @validates("login")
    def _normalize_login(self, key: str, value: str) -> str:
        """Normaliza login (trim + lowercase) e mantém login_normalized em sincronia.

        Aplicado na criação e em qualquer alteração via ORM — nunca depende de
        normalização feita apenas no frontend.
        """
        normalized = value.strip().lower()
        self.login_normalized = normalized
        return normalized
