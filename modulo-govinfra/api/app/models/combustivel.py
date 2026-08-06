"""Controle de diesel: tanques, movimentações e abastecimentos (item 37).

O estoque nunca é um número solto: cada litro que entra ou sai gera uma
movimentação com saldo anterior e posterior. Saldo negativo só é possível com
permissão administrativa e justificativa, e fica sinalizado.
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import (
    ActorMixin,
    Base,
    ConcurrencyMixin,
    Dinheiro,
    GeoMixin,
    JSONType,
    Quantidade,
    SoftDeleteMixin,
    TimestampMixin,
    UUIDPrimaryKeyMixin,
)
from app.models.enums import TipoCombustivel, TipoMovimentoCombustivel


class Tanque(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin, SoftDeleteMixin, ConcurrencyMixin):
    """Tanque próprio do Município (item 37.2)."""

    __tablename__ = "govinfra_fuel_tanks"
    __table_args__ = (UniqueConstraint("organizacao_id", "codigo", name="uq_govinfra_tanque"),)

    organizacao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govinfra_organizacoes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    codigo: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    nome: Mapped[str] = mapped_column(String(150), nullable=False)
    tipo_combustivel: Mapped[str] = mapped_column(
        String(30), default=TipoCombustivel.DIESEL_S10.value, nullable=False
    )
    local: Mapped[str | None] = mapped_column(String(200), nullable=True)
    capacidade_litros: Mapped[float] = mapped_column(Quantidade, nullable=False)
    estoque_atual_litros: Mapped[float] = mapped_column(Quantidade, default=0, nullable=False)
    estoque_minimo_litros: Mapped[float | None] = mapped_column(Quantidade, nullable=True)
    bombas: Mapped[list[str] | None] = mapped_column(JSONType, nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)
    observacoes: Mapped[str | None] = mapped_column(Text, nullable=True)

    @property
    def abaixo_do_minimo(self) -> bool:
        if self.estoque_minimo_litros is None:
            return False
        return (self.estoque_atual_litros or 0) <= self.estoque_minimo_litros


class MovimentoCombustivel(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin):
    """Entrada, saída, ajuste, perda ou transferência de combustível — append-only."""

    __tablename__ = "govinfra_fuel_movements"
    __table_args__ = (
        Index("ix_govinfra_mov_comb_tanque", "tanque_id", "created_at"),
        UniqueConstraint("chave_idempotencia", name="uq_govinfra_mov_comb_idem"),
    )

    tanque_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govinfra_fuel_tanks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    tipo: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    quantidade_litros: Mapped[float] = mapped_column(Quantidade, nullable=False)
    saldo_anterior: Mapped[float] = mapped_column(Quantidade, nullable=False)
    saldo_posterior: Mapped[float] = mapped_column(Quantidade, nullable=False)

    abastecimento_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govinfra_refuelings.id", ondelete="SET NULL"), nullable=True, index=True
    )
    tanque_destino_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govinfra_fuel_tanks.id", ondelete="SET NULL"), nullable=True
    )
    fornecedor: Mapped[str | None] = mapped_column(String(200), nullable=True)
    nota_fiscal: Mapped[str | None] = mapped_column(String(60), nullable=True)
    lote: Mapped[str | None] = mapped_column(String(60), nullable=True)
    valor_unitario: Mapped[float | None] = mapped_column(Dinheiro, nullable=True)
    valor_total: Mapped[float | None] = mapped_column(Dinheiro, nullable=True)
    motivo: Mapped[str | None] = mapped_column(String(300), nullable=True)
    justificativa: Mapped[str | None] = mapped_column(Text, nullable=True)
    permitiu_negativo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    chave_idempotencia: Mapped[str | None] = mapped_column(String(120), nullable=True)

    @staticmethod
    def eh_entrada(tipo: str) -> bool:
        return tipo == TipoMovimentoCombustivel.ENTRADA.value


class Abastecimento(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin, SoftDeleteMixin, GeoMixin):
    """Abastecimento de máquina ou veículo (item 37.1)."""

    __tablename__ = "govinfra_refuelings"
    __table_args__ = (
        Index("ix_govinfra_abast_maquina", "maquina_id", "abastecido_em"),
        Index("ix_govinfra_abast_veiculo", "veiculo_id", "abastecido_em"),
        Index("ix_govinfra_abast_data", "organizacao_id", "abastecido_em"),
        UniqueConstraint("chave_idempotencia", name="uq_govinfra_abast_idem"),
    )

    organizacao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govinfra_organizacoes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    abastecido_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    maquina_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govinfra_machines.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    veiculo_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govinfra_vehicles.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    responsavel_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govinfra_users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    operador_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govinfra_users.id", ondelete="SET NULL"), nullable=True
    )

    quantidade_litros: Mapped[float] = mapped_column(Quantidade, nullable=False)
    tipo_combustivel: Mapped[str] = mapped_column(
        String(30), default=TipoCombustivel.DIESEL_S10.value, nullable=False
    )
    valor_unitario: Mapped[float | None] = mapped_column(Dinheiro, nullable=True)
    valor_total: Mapped[float | None] = mapped_column(Dinheiro, nullable=True)

    horimetro: Mapped[float | None] = mapped_column(Quantidade, nullable=True)
    quilometragem: Mapped[float | None] = mapped_column(Quantidade, nullable=True)

    tanque_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govinfra_fuel_tanks.id", ondelete="SET NULL"), nullable=True, index=True
    )
    bomba: Mapped[str | None] = mapped_column(String(60), nullable=True)
    local: Mapped[str | None] = mapped_column(String(200), nullable=True)
    posto_externo: Mapped[str | None] = mapped_column(String(200), nullable=True)
    requisicao: Mapped[str | None] = mapped_column(String(60), nullable=True)
    nota_fiscal: Mapped[str | None] = mapped_column(String(60), nullable=True)

    ordem_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govinfra_work_orders.id", ondelete="SET NULL"), nullable=True, index=True
    )
    solicitacao_cacamba_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govinfra_dumpster_requests.id", ondelete="SET NULL"), nullable=True
    )

    # Inconsistências detectadas no momento do lançamento (item 37.4).
    alertas: Mapped[list[dict] | None] = mapped_column(JSONType, nullable=True)
    observacoes: Mapped[str | None] = mapped_column(Text, nullable=True)
    chave_idempotencia: Mapped[str | None] = mapped_column(String(120), nullable=True)

    @property
    def tem_alerta(self) -> bool:
        return bool(self.alertas)
