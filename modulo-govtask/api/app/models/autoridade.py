"""Autoridades, parlamentares e instituições externas (§7, §148)."""

import uuid
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin
from app.models.enums import EsferaRecurso, TipoAutoridade

if TYPE_CHECKING:
    from app.models.demanda import Demanda


class Autoridade(Base, TimestampMixin, SoftDeleteMixin):
    """Pessoa ou instituição externa relacionada a demandas.

    Não é usuário do sistema: é um cadastro administrativo de contato, sem
    acesso ao módulo. Uma autoridade pode se relacionar a várias demandas.
    """

    __tablename__ = "autoridades"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    nome: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    tipo: Mapped[TipoAutoridade] = mapped_column(
        String(30), nullable=False, default=TipoAutoridade.OUTRO, index=True
    )
    cargo: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    instituicao: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    partido: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    esfera: Mapped[Optional[EsferaRecurso]] = mapped_column(
        String(20), nullable=True, index=True
    )
    telefone: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    assessor_nome: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    assessor_telefone: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    observacoes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    contatos: Mapped[List["AutoridadeContato"]] = relationship(
        "AutoridadeContato",
        back_populates="autoridade",
        lazy="selectin",
        cascade="all, delete-orphan",
    )
    demandas: Mapped[List["Demanda"]] = relationship(
        "Demanda", back_populates="autoridade", viewonly=True
    )

    def __repr__(self) -> str:
        return f"<Autoridade {self.nome}>"


class AutoridadeContato(Base, TimestampMixin):
    """Contato adicional de uma autoridade (gabinete, assessoria, etc.)."""

    __tablename__ = "autoridade_contatos"

    autoridade_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("autoridades.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    nome: Mapped[str] = mapped_column(String(255), nullable=False)
    funcao: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    telefone: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    observacoes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    autoridade: Mapped["Autoridade"] = relationship(
        "Autoridade", back_populates="contatos"
    )
