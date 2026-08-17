"""Entidades de gestão arquivística (Fase 5): TTD, ciclo de vida, eliminação,
movimentação (transferência/recolhimento) e verificação de integridade.
"""

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.models.base import Base, SoftDeleteMixin, TenantMixin, TimestampMixin
from app.models.enums import DestinacaoFinal, FaseCicloVida, StatusEliminacao


class TabelaTemporalidade(Base, TimestampMixin, SoftDeleteMixin, TenantMixin):
    """TTD vinculada às classes do plano de classificação."""

    __tablename__ = "tabela_temporalidade"
    __table_args__ = (
        UniqueConstraint("classe_id", name="uq_ttd_classe"),
        Index("ix_ttd_tenant_classe", "tenant_id", "classe_id"),
    )

    classe_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("plano_classificacao.id", ondelete="CASCADE"),
        nullable=False,
    )
    prazo_corrente_anos: Mapped[int] = mapped_column(Integer, nullable=False)
    prazo_intermediario_anos: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    destinacao_final: Mapped[str] = mapped_column(
        String(20), default=DestinacaoFinal.GUARDA_PERMANENTE.value, nullable=False
    )
    observacoes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    fundamento: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    def __repr__(self) -> str:
        return f"<TTD classe={self.classe_id} dest={self.destinacao_final}>"


class ProcessoArquivistico(Base, TimestampMixin, TenantMixin):
    """Ciclo de vida do processo: corrente → intermediária → permanente/eliminação."""

    __tablename__ = "processos_arquivisticos"
    __table_args__ = (UniqueConstraint("processo_id", name="uq_processo_arquivistico"),)

    processo_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("processos.id", ondelete="CASCADE"),
        nullable=False,
    )
    fase: Mapped[str] = mapped_column(
        String(20), default=FaseCicloVida.CORRENTE.value, nullable=False
    )
    data_transferencia: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    data_recolhimento: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    destinacao_final: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    eliminado_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    def __repr__(self) -> str:
        return f"<ProcessoArquivistico p={self.processo_id} {self.fase}>"


class Eliminacao(Base, TimestampMixin, TenantMixin):
    __tablename__ = "eliminacoes"
    __table_args__ = (Index("ix_eliminacoes_tenant_status", "tenant_id", "status"),)

    titulo: Mapped[str] = mapped_column(String(300), nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), default=StatusEliminacao.ELABORACAO.value, nullable=False
    )
    criado_por_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    aprovado_por_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    aprovado_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    edital_publicado_em: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    edital_prazo_dias: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    termo_assinado_em: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    executada_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    def __repr__(self) -> str:
        return f"<Eliminacao {self.titulo} {self.status}>"


class ListagemEliminacao(Base, TimestampMixin, TenantMixin):
    __tablename__ = "listagem_eliminacao"
    __table_args__ = (Index("ix_listagem_eliminacao_tenant", "tenant_id", "eliminacao_id"),)

    eliminacao_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("eliminacoes.id", ondelete="CASCADE"),
        nullable=False,
    )
    processo_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("processos.id", ondelete="CASCADE"),
        nullable=False,
    )
    nup: Mapped[str] = mapped_column(String(25), nullable=False)
    classe_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("plano_classificacao.id", ondelete="SET NULL"),
        nullable=True,
    )
    justificativa: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    def __repr__(self) -> str:
        return f"<ListagemEliminacao elim={self.eliminacao_id} nup={self.nup}>"


class EditalEliminacao(Base, TimestampMixin, TenantMixin):
    __tablename__ = "edital_eliminacao"

    eliminacao_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("eliminacoes.id", ondelete="CASCADE"),
        nullable=False,
    )
    codigo: Mapped[str] = mapped_column(String(40), nullable=False)
    publicado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    prazo_manifestacao_dias: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    conteudo: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    def __repr__(self) -> str:
        return f"<EditalEliminacao {self.codigo}>"


class TermoEliminacao(Base, TimestampMixin, TenantMixin):
    __tablename__ = "termo_eliminacao"

    eliminacao_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("eliminacoes.id", ondelete="CASCADE"),
        nullable=False,
    )
    codigo: Mapped[str] = mapped_column(String(40), nullable=False)
    assinado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    signatario_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    hash_termo: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)

    def __repr__(self) -> str:
        return f"<TermoEliminacao {self.codigo}>"


class MovimentacaoArquivistica(Base, TimestampMixin, TenantMixin):
    """Transferência (corrente→intermediária) e recolhimento (→ permanente)."""

    __tablename__ = "movimentacoes_arquivisticas"
    __table_args__ = (Index("ix_mov_arquiv_tenant_processo", "tenant_id", "processo_id"),)

    processo_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("processos.id", ondelete="CASCADE"),
        nullable=False,
    )
    tipo: Mapped[str] = mapped_column(String(20), nullable=False)
    termo_codigo: Mapped[str] = mapped_column(String(40), nullable=False)
    executada_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    hash_termo: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    executado_por_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    def __repr__(self) -> str:
        return f"<MovimentacaoArquivistica {self.tipo} p={self.processo_id}>"


class VerificacaoIntegridade(Base, TimestampMixin, TenantMixin):
    __tablename__ = "verificacoes_integridade"

    executada_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    total_verificados: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    divergencias: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    def __repr__(self) -> str:
        n_div = len(self.divergencias) if self.divergencias else 0
        return f"<VerificacaoIntegridade {self.executada_em} divergencias={n_div}>"
