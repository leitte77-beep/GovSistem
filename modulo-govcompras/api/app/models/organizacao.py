"""Organização (prefeitura), estrutura administrativa e usuários.

A organização e o usuário chegam provisionados da plataforma GovSistem no
primeiro acesso (login único) — nenhum cadastro de senha é feito aqui, exceto
pela ponte de login de demonstração (`services/dev_auth.py`), que só existe
fora de produção.

Estrutura organizacional (seção 81): Prefeitura → Secretaria → Setor →
Usuário.
"""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.permissoes import Perfil
from app.models.base import Base, JSONType, SoftDeleteMixin, TimestampMixin, UUIDPrimaryKeyMixin


class Organizacao(Base, UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin):
    """Município atendido. Espelha o tenant da plataforma."""

    __tablename__ = "govcompras_organizacoes"

    externo_id: Mapped[str] = mapped_column(String(120), nullable=False, unique=True, index=True)
    nome: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    uf: Mapped[str | None] = mapped_column(String(2), nullable=True)
    ativa: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Secretaria(Base, UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "govcompras_secretarias"
    __table_args__ = (UniqueConstraint("organizacao_id", "sigla", name="uq_govcompras_secretaria_sigla"),)

    organizacao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govcompras_organizacoes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    nome: Mapped[str] = mapped_column(String(200), nullable=False)
    sigla: Mapped[str] = mapped_column(String(30), nullable=False)
    ativa: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    setores: Mapped[list["Setor"]] = relationship(back_populates="secretaria")


class Setor(Base, UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "govcompras_setores"
    __table_args__ = (UniqueConstraint("secretaria_id", "sigla", name="uq_govcompras_setor_sigla"),)

    secretaria_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govcompras_secretarias.id", ondelete="CASCADE"), nullable=False, index=True
    )
    nome: Mapped[str] = mapped_column(String(200), nullable=False)
    sigla: Mapped[str] = mapped_column(String(30), nullable=False)
    # Papel funcional que o setor cumpre no fluxo (compras/licitação/jurídico/
    # contabilidade/fiscal/solicitante) — usado para resolver o responsável de
    # etapas que apontam por `papel_responsavel` em vez de setor fixo.
    papel_funcional: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    secretaria: Mapped["Secretaria"] = relationship(back_populates="setores")


class User(Base, UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin):
    """Servidor com acesso ao módulo.

    Sem senha própria: a autenticação normal é da plataforma. A exceção é o
    login de demonstração (`password_hash` preenchido só para as personas
    fictícias da POC, nunca em produção).
    """

    __tablename__ = "govcompras_users"
    __table_args__ = (
        UniqueConstraint("organizacao_id", "externo_id", name="uq_govcompras_user_externo"),
    )

    organizacao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govcompras_organizacoes.id", ondelete="CASCADE", use_alter=True),
        nullable=False, index=True,
    )
    externo_id: Mapped[str] = mapped_column(
        String(120), nullable=False, index=True, doc="ID do usuário na plataforma GovSistem"
    )
    nome: Mapped[str] = mapped_column(String(200), nullable=False)
    email: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    telefone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    cargo: Mapped[str | None] = mapped_column(String(120), nullable=True)
    setor_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govcompras_setores.id", ondelete="SET NULL"), nullable=True, index=True
    )
    perfil: Mapped[str] = mapped_column(
        String(40), nullable=False, default=Perfil.CONSULTA.value, index=True
    )
    permissoes_extras: Mapped[list[str] | None] = mapped_column(JSONType, nullable=True)
    permissoes_revogadas: Mapped[list[str] | None] = mapped_column(JSONType, nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    ultimo_acesso_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Preenchido só para as 7 personas de demonstração (services/dev_auth.py).
    senha_demo_hash: Mapped[str | None] = mapped_column(String(200), nullable=True)

    @property
    def is_admin(self) -> bool:
        return self.perfil == Perfil.ADMINISTRADOR.value
