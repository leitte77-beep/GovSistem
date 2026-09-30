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
    BigInteger,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin


class Abastecimento(Base, TimestampMixin, SoftDeleteMixin):
    """Registro de abastecimento (saída de estoque).

    Cancelamento é auditável — nunca exclusão física.
    """

    __tablename__ = "abastecimentos"
    __table_args__ = (
        Index("ix_abast_org_data", "organization_id", "data_abastecimento"),
        Index("ix_abast_org_veiculo_data", "organization_id", "veiculo_id", "data_abastecimento"),
        Index("ix_abast_org_status_data", "organization_id", "status", "data_abastecimento"),
        Index("ix_abast_veiculo", "veiculo_id"),
        Index("ix_abast_motorista", "motorista_id"),
        Index("ix_abast_tanque", "tanque_id"),
        Index("uq_abast_idempotency", "organization_id", "idempotency_key", unique=True),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    veiculo_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("veiculos.id"), nullable=False
    )
    motorista_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("motoristas.id"), nullable=True
    )
    # Modalidade: TANQUE_PROPRIO (sai do estoque de um tanque da organização)
    # ou POSTO_CREDENCIADO (posto externo, ex.: vencedor da licitação — não
    # movimenta estoque; o custo é o preço pago no posto).
    modalidade: Mapped[str] = mapped_column(String(20), default="TANQUE_PROPRIO", nullable=False)
    tanque_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tanques.id"), nullable=True
    )
    fornecedor_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("fornecedores.id"), nullable=True, index=True
    )
    # Unidade (secretaria/centro de custo) do veículo no momento do lançamento.
    unidade_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("unidades.id"), nullable=True, index=True
    )
    combustivel_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("combustiveis.id"), nullable=False
    )

    quantidade_litros: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    quilometragem: Mapped[int] = mapped_column(BigInteger(), nullable=False)
    # Máquinas/tratores medem uso por horímetro (horas), não por km.
    horimetro: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 1), nullable=True)
    completou_tanque: Mapped[Optional[bool]] = mapped_column(Boolean(), nullable=True)

    # Origem: APP_MOTORISTA ou ADMIN
    origem: Mapped[str] = mapped_column(String(20), default="APP_MOTORISTA", nullable=False)
    lancado_por_usuario_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)

    # Idempotência: chave enviada pelo cliente para reenvio seguro
    # (unique com organization_id evita duplicidade real no banco).
    idempotency_key: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    idempotency_key_confirmed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    data_abastecimento: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    # Posto credenciado: preço pago e nota fiscal emitida pelo posto.
    preco_litro: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 4), nullable=True)
    # Contrato do posto que definiu o preço e de cujo saldo os litros saem.
    contrato_posto_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("contratos_posto.id"), nullable=True, index=True
    )
    numero_nf: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    chave_nfe: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)

    # Custo por litro: custo médio do tanque (tanque próprio) ou preço pago
    # no posto (posto credenciado). `custo_total` = litros × custo por litro.
    custo_medio_litro: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 4), nullable=True)
    custo_total: Mapped[Optional[Decimal]] = mapped_column(Numeric(15, 2), nullable=True)

    # Consumo calculado entre registros (km/L) — informativo
    consumo_km_l: Mapped[Optional[Decimal]] = mapped_column(Numeric(8, 2), nullable=True)
    # Consumo de máquinas por horímetro (L/h) — informativo
    consumo_l_h: Mapped[Optional[Decimal]] = mapped_column(Numeric(8, 2), nullable=True)

    # Códigos dos alertas de conferência disparados no registro (JSON: lista),
    # ex.: ["FORA_DO_HORARIO", "SEM_DESLOCAMENTO"]. Não bloqueiam o lançamento.
    alertas: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)

    foto_bomba_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    foto_painel_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    observacoes: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)

    status: Mapped[str] = mapped_column(String(20), default="CONFIRMADO", nullable=False)
    cancelado_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelado_por_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    motivo_cancelamento: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)

    # IP/metadados do registro (conforme política da aplicação)
    ip_origem: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)

    veiculo: Mapped["Veiculo"] = relationship(back_populates="abastecimentos")
    motorista: Mapped[Optional["Motorista"]] = relationship()
    tanque: Mapped[Optional["Tanque"]] = relationship()
    combustivel: Mapped["Combustivel"] = relationship()


class CorrecaoAbastecimento(Base, TimestampMixin):
    """Histórico de correções/cancelamentos de abastecimento — rastreabilidade total."""

    __tablename__ = "correcoes_abastecimento"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    abastecimento_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("abastecimentos.id"), nullable=False, index=True
    )
    tipo_correcao: Mapped[str] = mapped_column(String(30), nullable=False)  # CORRECAO | CANCELAMENTO
    dados_anteriores_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    dados_novos_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    justificativa: Mapped[str] = mapped_column(Text(), nullable=False)
    usuario_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
