import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin


class Combustivel(Base, TimestampMixin, SoftDeleteMixin):
    """Tipo de combustível — cadastro dinâmico, nunca hardcoded."""

    __tablename__ = "combustiveis"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    nome: Mapped[str] = mapped_column(String(100), nullable=False)
    unidade: Mapped[str] = mapped_column(String(20), default="litro", nullable=False)
    descricao: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    foto_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean(), default=True, nullable=False)


class Tanque(Base, TimestampMixin, SoftDeleteMixin):
    """Tanque de armazenamento de combustível (posto próprio da organização)."""

    __tablename__ = "tanques"
    __table_args__ = (
        Index("ix_tanques_org_combustivel", "organization_id", "combustivel_id"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    nome: Mapped[str] = mapped_column(String(150), nullable=False)
    codigo: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    localizacao: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    foto_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    combustivel_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("combustiveis.id"), nullable=False
    )
    capacidade_maxima: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    estoque_inicial: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), default=0, nullable=False
    )
    # Estoque atual é SEMPRE calculado via movimentações; esta coluna espelha o valor
    # corrente para leitura rápida e é atualizada apenas dentro de transação com lock.
    estoque_atual: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0, nullable=False)
    estoque_minimo: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0, nullable=False)
    ativo: Mapped[bool] = mapped_column(Boolean(), default=True, nullable=False)
    observacoes: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)

    combustivel: Mapped["Combustivel"] = relationship()


class Fornecedor(Base, TimestampMixin, SoftDeleteMixin):
    """Cadastro único de fornecedores classificado por categoria."""

    __tablename__ = "fornecedores"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    razao_social: Mapped[str] = mapped_column(String(255), nullable=False)
    nome_fantasia: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    cpf_cnpj: Mapped[Optional[str]] = mapped_column(String(20), nullable=True, index=True)
    telefone: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    site: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    contato: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    cep: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    logradouro: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    numero: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    complemento: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    bairro: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    cidade: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    uf: Mapped[Optional[str]] = mapped_column(String(2), nullable=True)
    # Mantém compatibilidade com o campo texto único (dado legado).
    endereco: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    foto_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    categoria: Mapped[str] = mapped_column(String(30), default="COMBUSTIVEL", nullable=False, index=True)
    observacoes: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean(), default=True, nullable=False)


class Oficina(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "oficinas"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    nome: Mapped[str] = mapped_column(String(255), nullable=False)
    razao_social: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    cpf_cnpj: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    telefone: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    endereco: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    responsavel: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    especialidade: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    observacoes: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    fornecedor_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean(), default=True, nullable=False)
