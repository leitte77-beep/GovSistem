import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class AcessoFornecedor(Base, TimestampMixin):
    """Login do portal do posto. Criado pela frota na ficha do fornecedor.

    Enxerga só os dados do próprio fornecedor. Senha com bcrypt; a senha
    provisória obriga troca no primeiro acesso. `credential_version` revoga as
    sessões ativas ao redefinir senha ou bloquear.
    """

    __tablename__ = "acessos_fornecedor"
    __table_args__ = (
        UniqueConstraint("login_normalized", name="uq_acessos_fornecedor_login"),
        CheckConstraint("login_normalized = lower(login)", name="ck_acesso_fornecedor_login_normalizado"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    fornecedor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("fornecedores.id", ondelete="CASCADE"), nullable=False, index=True
    )
    nome: Mapped[str] = mapped_column(String(150), nullable=False)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    login: Mapped[str] = mapped_column(String(60), nullable=False)
    login_normalized: Mapped[str] = mapped_column(String(60), nullable=False)
    senha_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    deve_trocar_senha: Mapped[bool] = mapped_column(Boolean(), default=True, nullable=False)
    bloqueado: Mapped[bool] = mapped_column(Boolean(), default=False, nullable=False)
    falhas_login: Mapped[int] = mapped_column(Integer(), default=0, nullable=False)
    locked_until: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    ultimo_acesso: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    credential_version: Mapped[int] = mapped_column(Integer(), default=0, nullable=False)
    criado_por_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
