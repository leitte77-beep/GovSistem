"""Manutenções preventivas e corretivas (item 38).

Vale para caçambas, máquinas e veículos — o alvo é identificado pelos três
campos opcionais de FK, e há restrição garantindo que exatamente um seja usado.
Abrir manutenção deixa o equipamento indisponível para agendamento.
"""

import uuid
from datetime import date

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import (
    ActorMixin,
    Base,
    Dinheiro,
    JSONType,
    Quantidade,
    SoftDeleteMixin,
    TimestampMixin,
    UUIDPrimaryKeyMixin,
)
from app.models.enums import BaseGatilhoPlano, SituacaoManutencao, TipoManutencao

_ALVO_UNICO = (
    "(CASE WHEN maquina_id IS NULL THEN 0 ELSE 1 END) + "
    "(CASE WHEN veiculo_id IS NULL THEN 0 ELSE 1 END) + "
    "(CASE WHEN cacamba_id IS NULL THEN 0 ELSE 1 END) = 1"
)


class PlanoManutencao(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin, SoftDeleteMixin):
    """Plano preventivo por período, quilometragem ou horímetro (item 38.2)."""

    __tablename__ = "govinfra_maintenance_plans"
    __table_args__ = (
        CheckConstraint(_ALVO_UNICO, name="ck_govinfra_plano_alvo_unico"),
        Index("ix_govinfra_plano_proxima", "organizacao_id", "proxima_data"),
    )

    organizacao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govinfra_organizacoes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    nome: Mapped[str] = mapped_column(String(150), nullable=False)
    descricao: Mapped[str | None] = mapped_column(Text, nullable=True)

    maquina_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govinfra_machines.id", ondelete="CASCADE"), nullable=True, index=True
    )
    veiculo_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govinfra_vehicles.id", ondelete="CASCADE"), nullable=True, index=True
    )
    cacamba_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govinfra_dumpsters.id", ondelete="CASCADE"), nullable=True, index=True
    )

    base_gatilho: Mapped[str] = mapped_column(
        String(30), default=BaseGatilhoPlano.PERIODO.value, nullable=False
    )
    intervalo_dias: Mapped[int | None] = mapped_column(Integer, nullable=True)
    intervalo_km: Mapped[float | None] = mapped_column(Quantidade, nullable=True)
    intervalo_horas: Mapped[float | None] = mapped_column(Quantidade, nullable=True)
    antecedencia_alerta_dias: Mapped[int] = mapped_column(Integer, default=15, nullable=False)
    antecedencia_alerta_medidor: Mapped[float | None] = mapped_column(Quantidade, nullable=True)

    ultima_data: Mapped[date | None] = mapped_column(Date, nullable=True)
    ultima_medicao: Mapped[float | None] = mapped_column(Quantidade, nullable=True)
    proxima_data: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    proxima_medicao: Mapped[float | None] = mapped_column(Quantidade, nullable=True)

    servicos_previstos: Mapped[list[str] | None] = mapped_column(JSONType, nullable=True)
    recomendacao_fabricante: Mapped[str | None] = mapped_column(Text, nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)


class Manutencao(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin, SoftDeleteMixin):
    """Ordem de manutenção (item 38.1)."""

    __tablename__ = "govinfra_maintenances"
    __table_args__ = (
        CheckConstraint(_ALVO_UNICO, name="ck_govinfra_manutencao_alvo_unico"),
        Index("ix_govinfra_manutencao_situacao", "organizacao_id", "situacao"),
        Index("ix_govinfra_manutencao_periodo", "data_abertura", "data_conclusao"),
    )

    organizacao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govinfra_organizacoes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    plano_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govinfra_maintenance_plans.id", ondelete="SET NULL"), nullable=True
    )
    maquina_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govinfra_machines.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    veiculo_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govinfra_vehicles.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    cacamba_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govinfra_dumpsters.id", ondelete="RESTRICT"), nullable=True, index=True
    )

    tipo: Mapped[str] = mapped_column(
        String(20), default=TipoManutencao.CORRETIVA.value, nullable=False, index=True
    )
    data_abertura: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    defeito: Mapped[str | None] = mapped_column(Text, nullable=True)
    diagnostico: Mapped[str | None] = mapped_column(Text, nullable=True)
    prioridade: Mapped[str] = mapped_column(String(20), default="normal", nullable=False)
    quilometragem: Mapped[float | None] = mapped_column(Quantidade, nullable=True)
    horimetro: Mapped[float | None] = mapped_column(Quantidade, nullable=True)

    servicos: Mapped[str | None] = mapped_column(Text, nullable=True)
    pecas: Mapped[list[dict] | None] = mapped_column(JSONType, nullable=True)
    oficina: Mapped[str | None] = mapped_column(String(200), nullable=True)
    fornecedor: Mapped[str | None] = mapped_column(String(200), nullable=True)
    custo_pecas: Mapped[float | None] = mapped_column(Dinheiro, nullable=True)
    custo_servicos: Mapped[float | None] = mapped_column(Dinheiro, nullable=True)
    custo_total: Mapped[float | None] = mapped_column(Dinheiro, nullable=True)

    data_prevista: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    data_conclusao: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    horas_parado: Mapped[float | None] = mapped_column(Quantidade, nullable=True)

    situacao: Mapped[str] = mapped_column(
        String(30), default=SituacaoManutencao.ABERTA.value, nullable=False, index=True
    )
    # Situação em que o equipamento estava antes de entrar em manutenção — para
    # devolvê-lo ao estado correto na conclusão.
    situacao_anterior_equipamento: Mapped[str | None] = mapped_column(String(40), nullable=True)
    responsavel_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govinfra_users.id", ondelete="SET NULL"), nullable=True
    )
    observacoes: Mapped[str | None] = mapped_column(Text, nullable=True)
