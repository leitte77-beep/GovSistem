"""Entidades de gestão (Fase 4): feriados, prazos, sobrestamento, acompanhamento,
base de conhecimento e indisponibilidade.
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
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, SoftDeleteMixin, TenantMixin, TimestampMixin
from app.models.enums import EscopoFeriado, ModoContagem, TipoPrazo


class Feriado(Base, TimestampMixin, SoftDeleteMixin, TenantMixin):
    __tablename__ = "feriados"
    __table_args__ = (
        UniqueConstraint("tenant_id", "data", name="uq_feriado_tenant_data"),
        Index("ix_feriados_tenant_ano", "tenant_id", "data"),
    )

    data: Mapped[date] = mapped_column(Date, nullable=False)
    nome: Mapped[str] = mapped_column(String(200), nullable=False)
    escopo: Mapped[str] = mapped_column(
        String(20), default=EscopoFeriado.NACIONAL.value, nullable=False
    )
    ponto_facultativo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    def __repr__(self) -> str:
        return f"<Feriado {self.data} {self.nome}>"


class Prazo(Base, TimestampMixin, TenantMixin):
    __tablename__ = "prazos"
    __table_args__ = (
        Index("ix_prazos_tenant_processo", "tenant_id", "processo_id"),
        Index("ix_prazos_tenant_vencimento", "tenant_id", "data_vencimento"),
        Index("ix_prazos_tenant_unidade", "tenant_id", "unidade_id"),
    )

    processo_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("processos.id", ondelete="CASCADE"),
        nullable=False,
    )
    tipo: Mapped[str] = mapped_column(String(20), default=TipoPrazo.INTERNO.value, nullable=False)
    titulo: Mapped[str] = mapped_column(String(300), nullable=False)
    dias: Mapped[int] = mapped_column(Integer, nullable=False)
    modo: Mapped[str] = mapped_column(
        String(10), default=ModoContagem.CORRIDOS.value, nullable=False
    )
    data_inicio: Mapped[date] = mapped_column(Date, nullable=False)
    data_vencimento: Mapped[date] = mapped_column(Date, nullable=False)
    prorrogado: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    prorrogacoes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    motivo_prorrogacao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    concluido: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    concluido_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    criado_por_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    unidade_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("unidades.id", ondelete="SET NULL"),
        nullable=True,
    )

    def __repr__(self) -> str:
        return f"<Prazo {self.tipo} p={self.processo_id} vence={self.data_vencimento}>"


class SobrestamentoMotivo(Base, TimestampMixin, SoftDeleteMixin, TenantMixin):
    __tablename__ = "sobrestamento_motivos"

    nome: Mapped[str] = mapped_column(String(200), nullable=False)
    descricao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    def __repr__(self) -> str:
        return f"<SobrestamentoMotivo {self.nome}>"


class Sobrestamento(Base, TimestampMixin, TenantMixin):
    __tablename__ = "sobrestamentos"
    __table_args__ = (Index("ix_sobrestamentos_tenant_processo", "tenant_id", "processo_id"),)

    processo_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("processos.id", ondelete="CASCADE"),
        nullable=False,
    )
    motivo_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("sobrestamento_motivos.id", ondelete="SET NULL"),
        nullable=True,
    )
    motivo_texto: Mapped[str] = mapped_column(Text, nullable=False)
    inicio: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    fim_previsto: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    evento: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    reativado_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    criado_por_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    def __repr__(self) -> str:
        return f"<Sobrestamento p={self.processo_id} ativo={self.ativo}>"


class AcompanhamentoEspecial(Base, TimestampMixin, TenantMixin):
    __tablename__ = "acompanhamentos_especiais"
    __table_args__ = (
        UniqueConstraint("processo_id", "usuario_id", name="uq_acompanhamento_processo_usuario"),
    )

    processo_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("processos.id", ondelete="CASCADE"),
        nullable=False,
    )
    usuario_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    etiqueta: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    def __repr__(self) -> str:
        return f"<AcompanhamentoEspecial p={self.processo_id} u={self.usuario_id}>"


class BaseConhecimento(Base, TimestampMixin, SoftDeleteMixin, TenantMixin):
    __tablename__ = "bases_conhecimento"

    tipo_processo_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tipos_processo.id", ondelete="SET NULL"),
        nullable=True,
    )
    titulo: Mapped[str] = mapped_column(String(300), nullable=False)
    conteudo: Mapped[str] = mapped_column(Text, nullable=False)
    base_legal: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    def __repr__(self) -> str:
        return f"<BaseConhecimento {self.titulo}>"


class Indisponibilidade(Base, TimestampMixin, TenantMixin):
    __tablename__ = "indisponibilidades"
    __table_args__ = (Index("ix_indisponibilidades_tenant_inicio", "tenant_id", "inicio"),)

    tipo: Mapped[str] = mapped_column(String(20), default="INCIDENTE", nullable=False)
    inicio: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    fim: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    escopo: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    causa: Mapped[str] = mapped_column(Text, nullable=False)
    encerrada: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    certidao_emitida: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    registrado_por_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    def __repr__(self) -> str:
        return f"<Indisponibilidade {self.inicio} encerrada={self.encerrada}>"
