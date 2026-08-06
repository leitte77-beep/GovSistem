"""Organização (prefeitura) e usuários do módulo.

Nenhum dos dois é cadastrado dentro do GovInfra: ambos chegam provisionados da
plataforma GovSistem no primeiro acesso (login único). O que existe aqui é
apenas a projeção local necessária para relacionar registros e permissões.
"""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.core.permissoes import Perfil
from app.models.base import (
    Base,
    JSONType,
    SoftDeleteMixin,
    TimestampMixin,
    UUIDPrimaryKeyMixin,
)


class Organizacao(Base, UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin):
    """Município atendido. Espelha o tenant da plataforma."""

    __tablename__ = "govinfra_organizacoes"

    externo_id: Mapped[str] = mapped_column(String(120), nullable=False, unique=True, index=True)
    nome: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    uf: Mapped[str | None] = mapped_column(String(2), nullable=True)
    ativa: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class User(Base, UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin):
    """Servidor com acesso ao módulo.

    Não há senha aqui: a autenticação é sempre da plataforma. O que o GovInfra
    controla é o PERFIL dentro do módulo e as concessões/revogações individuais.
    """

    __tablename__ = "govinfra_users"
    __table_args__ = (
        UniqueConstraint("organizacao_id", "externo_id", name="uq_govinfra_user_externo"),
    )

    organizacao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("govinfra_organizacoes.id", ondelete="CASCADE", use_alter=True),
        nullable=False,
        index=True,
    )
    externo_id: Mapped[str] = mapped_column(
        String(120), nullable=False, index=True, doc="ID do usuário na plataforma GovSistem"
    )
    nome: Mapped[str] = mapped_column(String(200), nullable=False)
    email: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    matricula: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    telefone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    cargo: Mapped[str | None] = mapped_column(String(120), nullable=True)
    perfil: Mapped[str] = mapped_column(
        String(40), nullable=False, default=Perfil.CONSULTA.value, index=True
    )
    # Concessões e revogações individuais sobre o perfil (item 46).
    permissoes_extras: Mapped[list[str] | None] = mapped_column(JSONType, nullable=True)
    permissoes_revogadas: Mapped[list[str] | None] = mapped_column(JSONType, nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    ultimo_acesso_em: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    @property
    def is_admin(self) -> bool:
        return self.perfil == Perfil.ADMINISTRADOR.value
