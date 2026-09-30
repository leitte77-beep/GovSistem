import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    Boolean,
    Date,
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
    """Tipo de combustível/fluido — cadastro dinâmico, nunca hardcoded.

    `categoria` classifica o produto em COMBUSTIVEL (Diesel, Gasolina, Etanol)
    ou FLUIDO_AUXILIAR (ex.: ARLA 32), permitindo tratar fluidos de operação
    com a mesma infraestrutura de estoque/entrada/abastecimento.
    """

    __tablename__ = "combustiveis"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    nome: Mapped[str] = mapped_column(String(100), nullable=False)
    unidade: Mapped[str] = mapped_column(String(20), default="litro", nullable=False)
    categoria: Mapped[str] = mapped_column(
        String(20), default="COMBUSTIVEL", nullable=False, index=True
    )
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
    # Posto externo onde os motoristas podem abastecer (ex.: vencedor da licitação).
    posto_credenciado: Mapped[bool] = mapped_column(Boolean(), default=False, nullable=False)
    observacoes: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean(), default=True, nullable=False)


class ContratoPosto(Base, TimestampMixin, SoftDeleteMixin):
    """Contrato/ata com o posto credenciado para um combustível.

    Define o preço por litro cobrado nos abastecimentos do posto (o motorista
    não informa valor) e os litros contratados. O saldo não é gravado: é
    `litros_contratados` menos os abastecimentos CONFIRMADOS vinculados, então
    cancelar um abastecimento devolve o saldo.
    """

    __tablename__ = "contratos_posto"
    __table_args__ = (
        Index("ix_contratos_posto_org_fornecedor", "organization_id", "fornecedor_id", "combustivel_id"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    fornecedor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("fornecedores.id"), nullable=False
    )
    combustivel_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("combustiveis.id"), nullable=False
    )
    numero: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    preco_litro: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)
    litros_contratados: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    data_inicio: Mapped[Optional[date]] = mapped_column(Date(), nullable=True)
    data_fim: Mapped[Optional[date]] = mapped_column(Date(), nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean(), default=True, nullable=False)
    observacoes: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)

    combustivel: Mapped["Combustivel"] = relationship()
