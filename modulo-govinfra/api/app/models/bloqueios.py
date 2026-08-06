"""Bloqueios e restrições (item 10).

Sistema centralizado: a mesma tabela atende caçambas e Porteira Adentro, com o
campo `servico_afetado` decidindo o alcance. O histórico é preservado — encerrar
ou revogar um bloqueio grava quem, quando e por quê, nunca apaga a linha.
"""

import uuid
from datetime import date, datetime
from typing import Optional

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import (
    ActorMixin,
    Base,
    TimestampMixin,
    UUIDPrimaryKeyMixin,
)
from app.models.enums import ServicoAfetado, SituacaoBloqueio, TipoBloqueio


class MotivoBloqueio(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin):
    """Motivos configuráveis (item 10.2) — nada de texto solto na regra."""

    __tablename__ = "govinfra_block_reasons"
    __table_args__ = (
        UniqueConstraint("organizacao_id", "chave", name="uq_govinfra_motivo_bloqueio"),
    )

    organizacao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govinfra_organizacoes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    chave: Mapped[str] = mapped_column(String(60), nullable=False)
    nome: Mapped[str] = mapped_column(String(150), nullable=False)
    descricao: Mapped[str | None] = mapped_column(Text, nullable=True)
    servico_padrao: Mapped[str] = mapped_column(
        String(30), default=ServicoAfetado.TODOS.value, nullable=False
    )
    tipo_padrao: Mapped[str] = mapped_column(
        String(30), default=TipoBloqueio.TEMPORARIO.value, nullable=False
    )
    dias_padrao: Mapped[int | None] = mapped_column(nullable=True)
    exige_documento: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    ordem: Mapped[int] = mapped_column(default=0, nullable=False)


class Bloqueio(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin):
    """Impedimento aplicado a uma pessoa e/ou imóvel.

    O bloqueio nunca é apagado: ao ser removido, ganha situação `revogado` com
    justificativa, usuário e data — exigência do item 10.3.
    """

    __tablename__ = "govinfra_blocks"
    __table_args__ = (
        Index("ix_govinfra_bloqueio_ativo", "organizacao_id", "situacao", "servico_afetado"),
        Index("ix_govinfra_bloqueio_pessoa", "pessoa_id", "situacao"),
        Index("ix_govinfra_bloqueio_imovel", "imovel_id", "situacao"),
    )

    organizacao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govinfra_organizacoes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    pessoa_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govinfra_people.id", ondelete="CASCADE"), nullable=True, index=True
    )
    imovel_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govinfra_properties.id", ondelete="CASCADE"), nullable=True, index=True
    )
    motivo_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govinfra_block_reasons.id", ondelete="SET NULL"), nullable=True
    )

    servico_afetado: Mapped[str] = mapped_column(
        String(30), default=ServicoAfetado.TODOS.value, nullable=False
    )
    tipo: Mapped[str] = mapped_column(
        String(30), default=TipoBloqueio.TEMPORARIO.value, nullable=False
    )
    descricao: Mapped[str | None] = mapped_column(Text, nullable=True)
    data_inicio: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    data_fim: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)

    situacao: Mapped[str] = mapped_column(
        String(20), default=SituacaoBloqueio.ATIVO.value, nullable=False, index=True
    )
    observacoes: Mapped[str | None] = mapped_column(Text, nullable=True)

    revogado_por_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govinfra_users.id", ondelete="SET NULL"), nullable=True
    )
    revogado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    justificativa_revogacao: Mapped[str | None] = mapped_column(Text, nullable=True)

    motivo: Mapped[Optional["MotivoBloqueio"]] = relationship(lazy="joined")

    def vigente_em(self, referencia: date) -> bool:
        """O bloqueio impede atendimento na data informada?"""
        if self.situacao != SituacaoBloqueio.ATIVO.value:
            return False
        if self.data_inicio and referencia < self.data_inicio:
            return False
        if self.data_fim and referencia > self.data_fim:
            return False
        return True
