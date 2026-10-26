"""Estoque, almoxarifado e assistência farmacêutica (Fase 8, B.4-001…043).

``movimentacoes_estoque`` é um **ledger imutável**: o saldo em qualquer data é a
soma das movimentações até ela. Correção é sempre nova movimentação (ajuste ou
estorno), nunca UPDATE/DELETE (regra 3 do prompt).
"""

from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import (
    ActorMixin,
    BaixaMixin,
    Base,
    JSONType,
    Quantidade,
    TenantMixin,
    TimestampMixin,
    UUIDPrimaryKeyMixin,
    VersaoMixin,
)

# Custo unitário com 4 casas: o total da movimentação é arredondado a 2 casas.
CustoUnitario = Numeric(14, 4, asdecimal=False)


class Produto(
    Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, VersaoMixin, ActorMixin, BaixaMixin
):
    """B.4-003 — catálogo do tenant (Rename/Remume, CATMAT, OBM)."""

    __tablename__ = "produtos_estoque"
    __table_args__ = (
        UniqueConstraint("tenant_id", "codigo", name="uq_produtos_estoque_codigo"),
        CheckConstraint(
            "tipo IN ('MEDICAMENTO','VACINA','INSUMO','MATERIAL')", name="ck_produtos_estoque_tipo"
        ),
    )
    codigo: Mapped[str] = mapped_column(String(40), nullable=False)
    nome: Mapped[str] = mapped_column(String(300), nullable=False)
    tipo: Mapped[str] = mapped_column(String(20), nullable=False)
    unidade: Mapped[str] = mapped_column(String(20), nullable=False)
    principio_ativo: Mapped[str | None] = mapped_column(String(300), nullable=True)
    apresentacao: Mapped[str | None] = mapped_column(String(200), nullable=True)
    catmat: Mapped[str | None] = mapped_column(String(20), nullable=True)
    codigo_obm: Mapped[str | None] = mapped_column(String(30), nullable=True)
    remume: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    controlado: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    lista_controle: Mapped[str | None] = mapped_column(String(20), nullable=True)
    antimicrobiano: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class LocalEstoque(
    Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, VersaoMixin, ActorMixin, BaixaMixin
):
    """B.4-001 — almoxarifado, farmácia, sala de vacina etc. de um estabelecimento."""

    __tablename__ = "locais_estoque"
    __table_args__ = (UniqueConstraint("tenant_id", "nome", name="uq_locais_estoque_nome"),)
    estabelecimento_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("estabelecimentos.id", ondelete="RESTRICT"), nullable=False
    )
    nome: Mapped[str] = mapped_column(String(200), nullable=False)
    tipo: Mapped[str] = mapped_column(String(30), nullable=False)
    temperatura_min: Mapped[float | None] = mapped_column(
        Numeric(5, 2, asdecimal=False), nullable=True
    )
    temperatura_max: Mapped[float | None] = mapped_column(
        Numeric(5, 2, asdecimal=False), nullable=True
    )


class Lote(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, VersaoMixin, ActorMixin):
    """B.4-001/002 — lote com validade; bloqueio impede saída."""

    __tablename__ = "lotes_estoque"
    __table_args__ = (
        UniqueConstraint("tenant_id", "produto_id", "numero", name="uq_lotes_estoque_numero"),
    )
    produto_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("produtos_estoque.id", ondelete="RESTRICT"), nullable=False
    )
    numero: Mapped[str] = mapped_column(String(60), nullable=False)
    validade: Mapped[date] = mapped_column(Date, nullable=False)
    fabricante: Mapped[str | None] = mapped_column(String(200), nullable=True)
    bloqueado: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    bloqueio_motivo: Mapped[str | None] = mapped_column(Text, nullable=True)


class ParametroEstoque(
    Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, VersaoMixin, ActorMixin
):
    """B.4-004 — mínimo, máximo, ideal e ponto de pedido por local × produto."""

    __tablename__ = "parametros_estoque"
    __table_args__ = (
        UniqueConstraint("tenant_id", "local_id", "produto_id", name="uq_parametros_estoque"),
    )
    local_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("locais_estoque.id", ondelete="RESTRICT"), nullable=False
    )
    produto_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("produtos_estoque.id", ondelete="RESTRICT"), nullable=False
    )
    minimo: Mapped[float | None] = mapped_column(Quantidade, nullable=True)
    maximo: Mapped[float | None] = mapped_column(Quantidade, nullable=True)
    ideal: Mapped[float | None] = mapped_column(Quantidade, nullable=True)
    ponto_pedido: Mapped[float | None] = mapped_column(Quantidade, nullable=True)


class Movimentacao(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, ActorMixin):
    """Ledger imutável. ``quantidade`` tem sinal: entrada > 0, saída < 0."""

    __tablename__ = "movimentacoes_estoque"
    __table_args__ = (
        Index(
            "ix_mov_estoque_saldo", "tenant_id", "local_id", "produto_id", "lote_id", "ocorrido_em"
        ),
        Index("ix_mov_estoque_referencia", "tenant_id", "referencia_tipo", "referencia_id"),
        CheckConstraint("quantidade <> 0", name="ck_mov_estoque_quantidade"),
    )
    local_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("locais_estoque.id", ondelete="RESTRICT"), nullable=False
    )
    produto_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("produtos_estoque.id", ondelete="RESTRICT"), nullable=False
    )
    lote_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("lotes_estoque.id", ondelete="RESTRICT"), nullable=False
    )
    tipo: Mapped[str] = mapped_column(String(30), nullable=False)
    quantidade: Mapped[float] = mapped_column(Quantidade, nullable=False)
    custo_unitario: Mapped[float | None] = mapped_column(CustoUnitario, nullable=True)
    ocorrido_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    competencia: Mapped[str] = mapped_column(String(6), nullable=False)
    documento: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    motivo: Mapped[str | None] = mapped_column(Text, nullable=True)
    referencia_tipo: Mapped[str | None] = mapped_column(String(40), nullable=True)
    referencia_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    centro_custo: Mapped[str | None] = mapped_column(String(40), nullable=True)


class Requisicao(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, VersaoMixin, ActorMixin):
    """B.4-014/015 — requisição entre locais: atendimento parcial, aceite/recusa."""

    __tablename__ = "requisicoes_estoque"
    __table_args__ = (
        UniqueConstraint("tenant_id", "numero", name="uq_requisicoes_estoque_numero"),
    )
    numero: Mapped[str] = mapped_column(String(20), nullable=False)
    origem_local_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("locais_estoque.id", ondelete="RESTRICT"), nullable=False
    )
    destino_local_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("locais_estoque.id", ondelete="RESTRICT"), nullable=False
    )
    situacao: Mapped[str] = mapped_column(String(20), default="SOLICITADA", nullable=False)
    itens: Mapped[list] = mapped_column(JSONType, nullable=False)
    observacao: Mapped[str | None] = mapped_column(Text, nullable=True)
    motivo_recusa: Mapped[str | None] = mapped_column(Text, nullable=True)
    atendida_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    concluida_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Inventario(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, VersaoMixin, ActorMixin):
    """B.4-017 — enquanto aberto, o local não movimenta; o encerramento ajusta."""

    __tablename__ = "inventarios_estoque"
    __table_args__ = (Index("ix_inventarios_estoque_local", "tenant_id", "local_id", "situacao"),)
    local_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("locais_estoque.id", ondelete="RESTRICT"), nullable=False
    )
    situacao: Mapped[str] = mapped_column(String(20), default="ABERTO", nullable=False)
    contagens: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    divergencias: Mapped[list | None] = mapped_column(JSONType, nullable=True)
    encerrado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class CompetenciaEstoque(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, ActorMixin):
    """B.4-018 — competência encerrada não aceita movimentação retroativa."""

    __tablename__ = "competencias_estoque"
    __table_args__ = (UniqueConstraint("tenant_id", "competencia", name="uq_competencias_estoque"),)
    competencia: Mapped[str] = mapped_column(String(6), nullable=False)
    encerrada_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reaberta_motivo: Mapped[str | None] = mapped_column(Text, nullable=True)


class Dispensacao(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, VersaoMixin, ActorMixin):
    """B.4-020/021 — dispensação total/parcial por lote, com alerta de duplicidade."""

    __tablename__ = "dispensacoes"
    __table_args__ = (Index("ix_dispensacoes_cidadao", "tenant_id", "cidadao_id", "created_at"),)
    cidadao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("cidadaos.id", ondelete="RESTRICT"), nullable=False
    )
    local_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("locais_estoque.id", ondelete="RESTRICT"), nullable=False
    )
    prescricao_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("prescricoes.id", ondelete="SET NULL"), nullable=True
    )
    situacao: Mapped[str] = mapped_column(String(20), nullable=False)
    itens: Mapped[list] = mapped_column(JSONType, nullable=False)
    documento: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    alertas: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    justificativa: Mapped[str | None] = mapped_column(Text, nullable=True)
    estornada_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    estorno_motivo: Mapped[str | None] = mapped_column(Text, nullable=True)


class RegistroTemperatura(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, ActorMixin):
    """B.4-037 — leitura de temperatura do local; fora da faixa gera alerta."""

    __tablename__ = "temperaturas_estoque"
    __table_args__ = (Index("ix_temperaturas_estoque_local", "tenant_id", "local_id", "medido_em"),)
    local_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("locais_estoque.id", ondelete="RESTRICT"), nullable=False
    )
    temperatura: Mapped[float] = mapped_column(Numeric(5, 2, asdecimal=False), nullable=False)
    medido_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    fora_da_faixa: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    origem: Mapped[str] = mapped_column(String(20), default="MANUAL", nullable=False)
    observacao: Mapped[str | None] = mapped_column(Text, nullable=True)
