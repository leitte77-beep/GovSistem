"""Dotação orçamentária e autorização (seções 34-35)."""

import uuid

from sqlalchemy import ForeignKey, Integer, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, Dinheiro, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import DecisaoAutorizacao, StatusDotacao


class DotacaoOrcamentaria(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "govcompras_dotacoes"

    organizacao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govcompras_organizacoes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    exercicio: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    orgao: Mapped[str] = mapped_column(String(120), nullable=False)
    unidade: Mapped[str] = mapped_column(String(120), nullable=False)
    funcao: Mapped[str | None] = mapped_column(String(120), nullable=True)
    subfuncao: Mapped[str | None] = mapped_column(String(120), nullable=True)
    programa: Mapped[str | None] = mapped_column(String(120), nullable=True)
    projeto_atividade: Mapped[str | None] = mapped_column(String(120), nullable=True)
    elemento_despesa: Mapped[str] = mapped_column(String(120), nullable=False)
    fonte: Mapped[str | None] = mapped_column(String(120), nullable=True)
    conta: Mapped[str | None] = mapped_column(String(120), nullable=True)
    valor_total: Mapped[float] = mapped_column(Dinheiro, nullable=False)
    valor_comprometido: Mapped[float] = mapped_column(Dinheiro, default=0, nullable=False)

    @property
    def saldo(self) -> float:
        return round(self.valor_total - self.valor_comprometido, 2)


class ProcessoDotacao(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Vínculo processo↔dotação — é o "gate" resolvido pelo requisito
    `dotacao` do motor de workflow (dotação confirmada)."""

    __tablename__ = "govcompras_processo_dotacoes"

    processo_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govcompras_processos.id", ondelete="CASCADE"), nullable=False, index=True
    )
    dotacao_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("govcompras_dotacoes.id"), nullable=False)
    valor_reservado: Mapped[float] = mapped_column(Dinheiro, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default=StatusDotacao.SOLICITADA.value, nullable=False)
    justificativa_devolucao: Mapped[str | None] = mapped_column(Text, nullable=True)
    decidido_por_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("govcompras_users.id"), nullable=True)


class Autorizacao(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Decisão da autoridade competente (seção 35)."""

    __tablename__ = "govcompras_autorizacoes"
    __table_args__ = ()

    processo_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govcompras_processos.id", ondelete="CASCADE"), nullable=False, index=True
    )
    autoridade_usuario_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("govcompras_users.id"), nullable=False)
    decisao: Mapped[str] = mapped_column(String(20), nullable=False)
    justificativa: Mapped[str | None] = mapped_column(Text, nullable=True)

    @staticmethod
    def decisoes() -> list[str]:
        return [d.value for d in DecisaoAutorizacao]
