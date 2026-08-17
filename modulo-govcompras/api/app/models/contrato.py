"""Contrato e gestão contratual (seções 44-56) — o processo NÃO termina aqui:
gerar contrato muda o processo para EXECUÇÃO CONTRATUAL (seção 45)."""

import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import ActorMixin, Base, Dinheiro, Quantidade, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import StatusContrato, TipoAditivo


class Contrato(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin):
    __tablename__ = "govcompras_contratos"
    __table_args__ = (
        UniqueConstraint("organizacao_id", "exercicio", "numero", name="uq_govcompras_contrato_numero"),
    )

    organizacao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govcompras_organizacoes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    numero: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    exercicio: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    processo_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govcompras_processos.id"), nullable=False, index=True
    )
    fornecedor_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("govcompras_fornecedores.id"), nullable=False)
    secretaria_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("govcompras_secretarias.id"), nullable=False)

    objeto: Mapped[str] = mapped_column(Text, nullable=False)
    valor_global: Mapped[float] = mapped_column(Dinheiro, nullable=False)
    data_assinatura: Mapped[date | None] = mapped_column(Date, nullable=True)
    vigencia_inicio: Mapped[date] = mapped_column(Date, nullable=False)
    vigencia_fim: Mapped[date] = mapped_column(Date, nullable=False)

    gestor_usuario_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("govcompras_users.id"), nullable=True)
    fiscal_usuario_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("govcompras_users.id"), nullable=True)
    fiscal_substituto_usuario_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("govcompras_users.id"), nullable=True)

    garantia: Mapped[str | None] = mapped_column(String(200), nullable=True)
    reajuste: Mapped[str | None] = mapped_column(String(200), nullable=True)
    indice: Mapped[str | None] = mapped_column(String(60), nullable=True)
    condicoes_pagamento: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default=StatusContrato.VIGENTE.value, nullable=False)

    aditivos: Mapped[list["Aditivo"]] = relationship(back_populates="contrato", cascade="all, delete-orphan")
    apostilamentos: Mapped[list["Apostilamento"]] = relationship(back_populates="contrato", cascade="all, delete-orphan")
    saldo: Mapped["ContratoSaldo | None"] = relationship(back_populates="contrato", uselist=False, cascade="all, delete-orphan")
    saldos_item: Mapped[list["ContratoItemSaldo"]] = relationship(back_populates="contrato", cascade="all, delete-orphan")

    @property
    def dias_totais(self) -> int:
        return max((self.vigencia_fim - self.vigencia_inicio).days, 1)

    @property
    def dias_para_vencer(self) -> int:
        return (self.vigencia_fim - date.today()).days

    @property
    def percentual_vigencia_transcorrida(self) -> float:
        decorridos = (date.today() - self.vigencia_inicio).days
        return max(0.0, min(100.0, round(decorridos / self.dias_totais * 100, 1)))


class Aditivo(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin):
    """Termo aditivo (seção 53)."""

    __tablename__ = "govcompras_aditivos"

    contrato_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govcompras_contratos.id", ondelete="CASCADE"), nullable=False, index=True
    )
    numero: Mapped[str] = mapped_column(String(40), nullable=False)
    tipo: Mapped[str] = mapped_column(String(20), default=TipoAditivo.PRAZO.value, nullable=False)
    justificativa: Mapped[str] = mapped_column(Text, nullable=False)
    valor_acrescimo: Mapped[float | None] = mapped_column(Dinheiro, nullable=True)
    nova_vigencia_fim: Mapped[date | None] = mapped_column(Date, nullable=True)
    data: Mapped[date] = mapped_column(Date, nullable=False)
    aprovado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    publicado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    contrato: Mapped["Contrato"] = relationship(back_populates="aditivos")


class Apostilamento(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin):
    """Apostilamento (seção 54) — ajuste que não altera cláusulas essenciais."""

    __tablename__ = "govcompras_apostilamentos"

    contrato_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govcompras_contratos.id", ondelete="CASCADE"), nullable=False, index=True
    )
    descricao: Mapped[str] = mapped_column(Text, nullable=False)
    data: Mapped[date] = mapped_column(Date, nullable=False)

    contrato: Mapped["Contrato"] = relationship(back_populates="apostilamentos")


class ContratoSaldo(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Saldo financeiro geral do contrato (seção 55)."""

    __tablename__ = "govcompras_contrato_saldos"
    __table_args__ = (UniqueConstraint("contrato_id", name="uq_govcompras_contrato_saldo"),)

    contrato_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govcompras_contratos.id", ondelete="CASCADE"), nullable=False, index=True
    )
    valor_empenhado: Mapped[float] = mapped_column(Dinheiro, default=0, nullable=False)
    valor_liquidado: Mapped[float] = mapped_column(Dinheiro, default=0, nullable=False)
    valor_pago: Mapped[float] = mapped_column(Dinheiro, default=0, nullable=False)

    contrato: Mapped["Contrato"] = relationship(back_populates="saldo")

    def saldo_disponivel(self, valor_global: float) -> float:
        return round(valor_global - self.valor_empenhado, 2)


class ContratoItemSaldo(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Saldo por item do contrato (seção 56) — alerta em 70/80/90/100% de
    consumo, calculado on-read em `app/services/dashboard.py`."""

    __tablename__ = "govcompras_contrato_item_saldos"

    contrato_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govcompras_contratos.id", ondelete="CASCADE"), nullable=False, index=True
    )
    catalogo_item_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("govcompras_catalogo_itens.id"), nullable=True)
    descricao: Mapped[str] = mapped_column(String(300), nullable=False)
    quantidade_contratada: Mapped[float] = mapped_column(Quantidade, nullable=False)
    quantidade_utilizada: Mapped[float] = mapped_column(Quantidade, default=0, nullable=False)

    contrato: Mapped["Contrato"] = relationship(back_populates="saldos_item")

    @property
    def percentual_utilizado(self) -> float:
        if not self.quantidade_contratada:
            return 0.0
        return round(self.quantidade_utilizada / self.quantidade_contratada * 100, 1)

    @property
    def saldo(self) -> float:
        return round(self.quantidade_contratada - self.quantidade_utilizada, 3)
