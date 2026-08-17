"""Ata de Registro de Preços (seções 57-59)."""

import uuid
from datetime import date

from sqlalchemy import Date, ForeignKey, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import ActorMixin, Base, Dinheiro, Quantidade, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import StatusAta, StatusConsumoAta


class AtaRegistroPreco(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin):
    __tablename__ = "govcompras_atas"
    __table_args__ = (
        UniqueConstraint("organizacao_id", "exercicio", "numero", name="uq_govcompras_ata_numero"),
    )

    organizacao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govcompras_organizacoes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    numero: Mapped[str] = mapped_column(String(40), nullable=False)
    exercicio: Mapped[int] = mapped_column(nullable=False)
    processo_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("govcompras_processos.id"), nullable=False, index=True)
    fornecedor_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("govcompras_fornecedores.id"), nullable=False)
    objeto: Mapped[str] = mapped_column(String(400), nullable=False)
    vigencia_inicio: Mapped[date] = mapped_column(Date, nullable=False)
    vigencia_fim: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default=StatusAta.VIGENTE.value, nullable=False)

    itens: Mapped[list["AtaItemSaldo"]] = relationship(
        back_populates="ata", cascade="all, delete-orphan", lazy="selectin"
    )

    @property
    def dias_para_vencer(self) -> int:
        return (self.vigencia_fim - date.today()).days


class AtaItemSaldo(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Saldo por item da ata (seção 58): registrado/reservado/utilizado."""

    __tablename__ = "govcompras_ata_item_saldos"

    ata_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govcompras_atas.id", ondelete="CASCADE"), nullable=False, index=True
    )
    catalogo_item_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("govcompras_catalogo_itens.id"), nullable=True)
    descricao: Mapped[str] = mapped_column(String(300), nullable=False)
    valor_unitario_registrado: Mapped[float] = mapped_column(Dinheiro, nullable=False)
    quantidade_registrada: Mapped[float] = mapped_column(Quantidade, nullable=False)
    quantidade_reservada: Mapped[float] = mapped_column(Quantidade, default=0, nullable=False)
    quantidade_utilizada: Mapped[float] = mapped_column(Quantidade, default=0, nullable=False)

    ata: Mapped["AtaRegistroPreco"] = relationship(back_populates="itens")

    @property
    def quantidade_disponivel(self) -> float:
        return round(self.quantidade_registrada - self.quantidade_reservada - self.quantidade_utilizada, 3)

    @property
    def percentual_consumido(self) -> float:
        if not self.quantidade_registrada:
            return 0.0
        return round((self.quantidade_reservada + self.quantidade_utilizada) / self.quantidade_registrada * 100, 1)


class AtaSolicitacaoConsumo(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin):
    """Solicitação de consumo de ata por outra secretaria (seção 59)."""

    __tablename__ = "govcompras_ata_solicitacoes_consumo"

    ata_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("govcompras_atas.id", ondelete="CASCADE"), nullable=False, index=True)
    item_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("govcompras_ata_item_saldos.id"), nullable=False)
    solicitante_secretaria_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("govcompras_secretarias.id"), nullable=False)
    quantidade_solicitada: Mapped[float] = mapped_column(Quantidade, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default=StatusConsumoAta.SOLICITADA.value, nullable=False)
    justificativa: Mapped[str | None] = mapped_column(String(500), nullable=True)
