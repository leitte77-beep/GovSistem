import uuid
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, SoftDeleteMixin, TenantMixin, TimestampMixin

if TYPE_CHECKING:
    pass


class Unidade(Base, TimestampMixin, SoftDeleteMixin, TenantMixin):
    """Unidade = setor/secretaria/departamento, em árvore hierárquica."""

    __tablename__ = "unidades"
    __table_args__ = (
        UniqueConstraint("tenant_id", "sigla", name="uq_unidade_tenant_sigla"),
        Index("ix_unidades_tenant_pai", "tenant_id", "unidade_pai_id"),
    )

    sigla: Mapped[str] = mapped_column(String(20), nullable=False)
    nome: Mapped[str] = mapped_column(String(200), nullable=False)
    unidade_pai_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("unidades.id", ondelete="SET NULL"),
        nullable=True,
    )
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    protocolizadora: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        comment="Unidade autorizada a autuar processos (gera NUP)",
    )
    codigo_protocolizadora: Mapped[Optional[str]] = mapped_column(
        String(5), nullable=True, comment="Código de 5 dígitos para o grupo 1 do NUP"
    )
    ativa: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    def __repr__(self) -> str:
        return f"<Unidade {self.sigla}>"


class Cargo(Base, TimestampMixin, SoftDeleteMixin, TenantMixin):
    __tablename__ = "cargos"

    nome: Mapped[str] = mapped_column(String(150), nullable=False)
    descricao: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    def __repr__(self) -> str:
        return f"<Cargo {self.nome}>"


class LotacaoUsuario(Base, TimestampMixin, TenantMixin):
    """Lotação do usuário interno em uma ou mais unidades."""

    __tablename__ = "lotacoes_usuario"
    __table_args__ = (
        UniqueConstraint("user_id", "unidade_id", name="uq_lotacao_usuario_unidade"),
        Index("ix_lotacoes_tenant_user", "tenant_id", "user_id"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    unidade_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("unidades.id", ondelete="CASCADE"),
        nullable=False,
    )
    cargo_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("cargos.id", ondelete="SET NULL"),
        nullable=True,
    )
    principal: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    def __repr__(self) -> str:
        return f"<LotacaoUsuario user={self.user_id} unidade={self.unidade_id}>"
