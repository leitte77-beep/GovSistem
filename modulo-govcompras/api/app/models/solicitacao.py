"""Solicitação de contratação (seções 8-10) — ponto de entrada do ciclo."""

import uuid

from sqlalchemy import ForeignKey, Integer, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import ActorMixin, Base, Dinheiro, Quantidade, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import Prioridade, StatusSolicitacao, TipoObjeto


class Solicitacao(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin):
    __tablename__ = "govcompras_solicitacoes"
    __table_args__ = (
        UniqueConstraint("organizacao_id", "exercicio", "numero", name="uq_govcompras_solicitacao_numero"),
    )

    organizacao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govcompras_organizacoes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    numero: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    exercicio: Mapped[int] = mapped_column(Integer, nullable=False, index=True)

    secretaria_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govcompras_secretarias.id"), nullable=False, index=True
    )
    setor_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("govcompras_setores.id"), nullable=True)
    solicitante_usuario_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govcompras_users.id"), nullable=False
    )

    tipo_objeto: Mapped[str] = mapped_column(String(20), default=TipoObjeto.BEM.value, nullable=False)
    objeto: Mapped[str] = mapped_column(Text, nullable=False)
    descricao: Mapped[str | None] = mapped_column(Text, nullable=True)
    justificativa: Mapped[str] = mapped_column(Text, nullable=False)
    prioridade: Mapped[str] = mapped_column(String(20), default=Prioridade.NORMAL.value, nullable=False)
    data_desejada: Mapped[str | None] = mapped_column(String(10), nullable=True)
    recurso: Mapped[str | None] = mapped_column(String(200), nullable=True)
    convenio: Mapped[str | None] = mapped_column(String(200), nullable=True)
    fonte: Mapped[str | None] = mapped_column(String(200), nullable=True)
    dotacao_conhecida: Mapped[str | None] = mapped_column(String(200), nullable=True)
    observacoes: Mapped[str | None] = mapped_column(Text, nullable=True)

    valor_estimado_total: Mapped[float | None] = mapped_column(Dinheiro, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default=StatusSolicitacao.RASCUNHO.value, nullable=False)

    itens: Mapped[list["SolicitacaoItem"]] = relationship(
        back_populates="solicitacao", cascade="all, delete-orphan", lazy="selectin"
    )


class SolicitacaoItem(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "govcompras_solicitacao_itens"

    solicitacao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govcompras_solicitacoes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    catalogo_item_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govcompras_catalogo_itens.id"), nullable=True
    )
    codigo: Mapped[str | None] = mapped_column(String(40), nullable=True)
    descricao: Mapped[str] = mapped_column(Text, nullable=False)
    unidade: Mapped[str] = mapped_column(String(20), nullable=False)
    quantidade: Mapped[float] = mapped_column(Quantidade, nullable=False)
    especificacao: Mapped[str | None] = mapped_column(Text, nullable=True)
    valor_unitario_estimado: Mapped[float | None] = mapped_column(Dinheiro, nullable=True)
    observacoes: Mapped[str | None] = mapped_column(Text, nullable=True)

    solicitacao: Mapped["Solicitacao"] = relationship(back_populates="itens")
