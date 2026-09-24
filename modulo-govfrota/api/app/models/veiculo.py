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
    BigInteger,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin


class Veiculo(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "veiculos"
    __table_args__ = (
        Index("ix_veiculos_org_placa_ativo", "organization_id", "placa", "deleted_at"),
        Index("ix_veiculos_org_situacao", "organization_id", "situacao"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Identificação
    placa: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    renavam: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    chassi: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    codigo_interno: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    patrimonio: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    marca: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    modelo: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    versao: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    ano_fabricacao: Mapped[Optional[int]] = mapped_column(nullable=True)
    ano_modelo: Mapped[Optional[int]] = mapped_column(nullable=True)
    cor: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    tipo: Mapped[str] = mapped_column(String(30), default="CARRO", nullable=False)

    # Combustível principal (legado — mantido para compatibilidade/leitura rápida).
    # A fonte estruturada de reservatórios são as linhas de `VeiculoTanque`.
    combustivel_principal_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("combustiveis.id"), nullable=True
    )
    combustivel_secundario_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("combustiveis.id"), nullable=True
    )
    capacidade_tanque_litros: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(12, 2), nullable=True
    )

    # Controle
    quilometragem_atual: Mapped[int] = mapped_column(BigInteger(), default=0, nullable=False)
    horimetro_atual: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 1), nullable=True)
    usa_horimetro: Mapped[bool] = mapped_column(default=False, nullable=False)

    # Organizacional (nomenclatura varia conforme tipo da organização)
    unidade: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    departamento: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    filial: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    centro_custo: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)

    situacao: Mapped[str] = mapped_column(
        String(20), default="DISPONIVEL", nullable=False, index=True
    )
    observacoes: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)

    # Documentação
    vencimento_licenciamento: Mapped[Optional[date]] = mapped_column(Date(), nullable=True)
    vencimento_seguro: Mapped[Optional[date]] = mapped_column(Date(), nullable=True)

    foto_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    abastecimentos: Mapped[list["Abastecimento"]] = relationship(back_populates="veiculo")
    tanques: Mapped[list["VeiculoTanque"]] = relationship(
        back_populates="veiculo", cascade="all, delete-orphan"
    )


class VeiculoTanque(Base, TimestampMixin, SoftDeleteMixin):
    """Reservatório do veículo (principal ou auxiliar).

    Modelagem genérica escalável: permite tanque principal + um ou mais
    reservatórios auxiliares (ex.: Diesel no principal, ARLA 32 no auxiliar).
    `tank_type`: PRIMARY | AUXILIARY.
    """

    __tablename__ = "veiculos_tanques"
    __table_args__ = (
        Index("ix_veiculo_tanque_org_veiculo", "organization_id", "veiculo_id"),
        Index("ix_veiculo_tanque_combustivel", "combustivel_id"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    veiculo_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("veiculos.id", ondelete="CASCADE"), nullable=False, index=True
    )
    combustivel_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("combustiveis.id"), nullable=False
    )
    tank_type: Mapped[str] = mapped_column(String(20), default="AUXILIARY", nullable=False)
    capacidade: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    identificacao: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean(), default=True, nullable=False)

    veiculo: Mapped["Veiculo"] = relationship(back_populates="tanques")
    combustivel: Mapped["Combustivel"] = relationship()  # noqa: F821


class VeiculoDocumento(Base, TimestampMixin):
    """Documentos anexados ao veículo (CRLV, seguro, laudos etc.)."""

    __tablename__ = "veiculos_documentos"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    veiculo_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("veiculos.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    descricao: Mapped[str] = mapped_column(String(255), nullable=False)
    tipo: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    vencimento: Mapped[Optional[date]] = mapped_column(Date(), nullable=True)
    anexo_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    arquivo_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    observacoes: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)


class AlteracaoQuilometragem(Base, TimestampMixin):
    """Auditoria de alterações manuais de quilometragem do veículo."""

    __tablename__ = "veiculos_alteracoes_km"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    veiculo_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("veiculos.id", ondelete="CASCADE"), nullable=False, index=True
    )
    km_anterior: Mapped[int] = mapped_column(BigInteger(), nullable=False)
    km_novo: Mapped[int] = mapped_column(BigInteger(), nullable=False)
    usuario_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    justificativa: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
