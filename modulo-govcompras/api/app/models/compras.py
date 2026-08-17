"""Catálogo, fornecedores e pesquisa de preços/cotações (seções 25-33)."""

import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import (
    ActorMixin,
    Base,
    Dinheiro,
    Quantidade,
    SoftDeleteMixin,
    TimestampMixin,
    UUIDPrimaryKeyMixin,
)
from app.models.enums import SituacaoFornecedor, StatusCotacao


class CatalogoItem(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin):
    """Catálogo municipal de produtos e serviços (seção 25)."""

    __tablename__ = "govcompras_catalogo_itens"
    __table_args__ = (UniqueConstraint("organizacao_id", "codigo", name="uq_govcompras_catalogo_codigo"),)

    organizacao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govcompras_organizacoes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    codigo: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    descricao: Mapped[str] = mapped_column(String(300), nullable=False)
    unidade_medida: Mapped[str] = mapped_column(String(20), nullable=False)
    categoria: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    especificacao_padrao: Mapped[str | None] = mapped_column(Text, nullable=True)
    ativo: Mapped[bool] = mapped_column(default=True, nullable=False)

    historico_precos: Mapped[list["CatalogoItemPrecoHistorico"]] = relationship(
        back_populates="item", order_by="CatalogoItemPrecoHistorico.data_referencia.desc()", lazy="selectin"
    )


class CatalogoItemPrecoHistorico(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Histórico de preços praticados (seção 26) — base para novas estimativas."""

    __tablename__ = "govcompras_catalogo_item_precos"

    catalogo_item_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govcompras_catalogo_itens.id", ondelete="CASCADE"), nullable=False, index=True
    )
    fonte: Mapped[str] = mapped_column(String(20), nullable=False, doc="cotacao | contrato | ata")
    valor: Mapped[float] = mapped_column(Dinheiro, nullable=False)
    data_referencia: Mapped[date] = mapped_column(Date, nullable=False)
    processo_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("govcompras_processos.id"), nullable=True)
    fornecedor_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("govcompras_fornecedores.id"), nullable=True)

    item: Mapped["CatalogoItem"] = relationship(back_populates="historico_precos")


class Fornecedor(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin, SoftDeleteMixin):
    """Cadastro central de fornecedores (seção 27)."""

    __tablename__ = "govcompras_fornecedores"
    __table_args__ = (UniqueConstraint("organizacao_id", "cnpj", name="uq_govcompras_fornecedor_cnpj"),)

    organizacao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govcompras_organizacoes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    razao_social: Mapped[str] = mapped_column(String(200), nullable=False)
    nome_fantasia: Mapped[str | None] = mapped_column(String(200), nullable=True)
    cnpj: Mapped[str] = mapped_column(String(18), nullable=False, index=True)
    endereco: Mapped[str | None] = mapped_column(String(300), nullable=True)
    municipio: Mapped[str | None] = mapped_column(String(120), nullable=True)
    uf: Mapped[str | None] = mapped_column(String(2), nullable=True)
    cep: Mapped[str | None] = mapped_column(String(10), nullable=True)
    telefone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    whatsapp: Mapped[str | None] = mapped_column(String(20), nullable=True)
    email: Mapped[str | None] = mapped_column(String(200), nullable=True)
    representante: Mapped[str | None] = mapped_column(String(200), nullable=True)
    categorias_fornecidas: Mapped[str | None] = mapped_column(String(300), nullable=True)
    situacao: Mapped[str] = mapped_column(String(20), default=SituacaoFornecedor.ATIVO.value, nullable=False)
    observacoes: Mapped[str | None] = mapped_column(Text, nullable=True)

    documentos: Mapped[list["FornecedorDocumento"]] = relationship(
        back_populates="fornecedor", cascade="all, delete-orphan", lazy="selectin"
    )


class FornecedorDocumento(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Certidões/habilitações do fornecedor (seção 28).

    Status (válido/vencido) nunca é persistido — é sempre `validade_ate <
    hoje()`, calculado on-read, mesmo padrão do SLA do processo.
    """

    __tablename__ = "govcompras_fornecedor_documentos"

    fornecedor_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govcompras_fornecedores.id", ondelete="CASCADE"), nullable=False, index=True
    )
    tipo: Mapped[str] = mapped_column(String(60), nullable=False, doc="CND_FEDERAL | FGTS | CNDT | ...")
    storage_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    validade_ate: Mapped[date | None] = mapped_column(Date, nullable=True)

    fornecedor: Mapped["Fornecedor"] = relationship(back_populates="documentos")

    @property
    def vencido(self) -> bool:
        return self.validade_ate is not None and self.validade_ate < date.today()


class Cotacao(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin):
    """Pesquisa de preços/cotação (seções 30-33)."""

    __tablename__ = "govcompras_cotacoes"

    processo_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govcompras_processos.id", ondelete="CASCADE"), nullable=False, index=True
    )
    numero: Mapped[str] = mapped_column(String(40), nullable=False)
    data_abertura: Mapped[date] = mapped_column(Date, nullable=False)
    prazo_resposta: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default=StatusCotacao.EM_ANDAMENTO.value, nullable=False)

    fornecedores: Mapped[list["CotacaoFornecedor"]] = relationship(
        back_populates="cotacao", cascade="all, delete-orphan", lazy="selectin"
    )
    itens: Mapped[list["CotacaoItem"]] = relationship(
        back_populates="cotacao", cascade="all, delete-orphan", lazy="selectin"
    )


class CotacaoFornecedor(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Rastreamento do envio/resposta por fornecedor (seção 33)."""

    __tablename__ = "govcompras_cotacao_fornecedores"

    cotacao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govcompras_cotacoes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    fornecedor_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("govcompras_fornecedores.id"), nullable=False)
    enviada_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    visualizada_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    respondida_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    recusada_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    validade_dias: Mapped[int | None] = mapped_column(nullable=True)
    prazo_entrega_dias: Mapped[int | None] = mapped_column(nullable=True)
    observacoes: Mapped[str | None] = mapped_column(Text, nullable=True)

    cotacao: Mapped["Cotacao"] = relationship(back_populates="fornecedores")
    precos: Mapped[list["CotacaoPreco"]] = relationship(
        back_populates="cotacao_fornecedor", cascade="all, delete-orphan", lazy="selectin"
    )

    @property
    def situacao(self) -> str:
        if self.respondida_em:
            return "respondida"
        if self.recusada_em:
            return "recusada"
        if self.visualizada_em:
            return "visualizada"
        if self.enviada_em:
            return "enviada"
        return "pendente"


class CotacaoItem(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "govcompras_cotacao_itens"

    cotacao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govcompras_cotacoes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    catalogo_item_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("govcompras_catalogo_itens.id"), nullable=True)
    descricao: Mapped[str] = mapped_column(Text, nullable=False)
    quantidade: Mapped[float] = mapped_column(Quantidade, nullable=False)

    cotacao: Mapped["Cotacao"] = relationship(back_populates="itens")
    precos: Mapped[list["CotacaoPreco"]] = relationship(
        back_populates="cotacao_item", cascade="all, delete-orphan", lazy="selectin"
    )


class CotacaoPreco(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Preço ofertado por um fornecedor para um item — base do mapa comparativo."""

    __tablename__ = "govcompras_cotacao_precos"
    __table_args__ = (
        UniqueConstraint("cotacao_item_id", "cotacao_fornecedor_id", name="uq_govcompras_cotacao_preco"),
    )

    cotacao_item_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govcompras_cotacao_itens.id", ondelete="CASCADE"), nullable=False, index=True
    )
    cotacao_fornecedor_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govcompras_cotacao_fornecedores.id", ondelete="CASCADE"), nullable=False, index=True
    )
    valor_unitario: Mapped[float] = mapped_column(Dinheiro, nullable=False)
    marca_modelo: Mapped[str | None] = mapped_column(String(200), nullable=True)

    cotacao_item: Mapped["CotacaoItem"] = relationship(back_populates="precos")
    cotacao_fornecedor: Mapped["CotacaoFornecedor"] = relationship(back_populates="precos")
