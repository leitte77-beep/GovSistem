"""Entidades do módulo cidadão (Fase 3): usuário externo, peticionamento, recibo,
intimação, acesso externo e manifestação (ouvidoria).
"""

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    Boolean,
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
from app.models.enums import StatusIntimacao, StatusPeticionamento, TipoPeticionamento


class UsuarioExterno(Base, TimestampMixin, SoftDeleteMixin, TenantMixin):
    """Cidadão/empresa/advogado. Cadastro próprio (sem gov.br), com aprovação do órgão."""

    __tablename__ = "usuarios_externos"
    __table_args__ = (
        UniqueConstraint("tenant_id", "email", name="uq_usuario_externo_tenant_email"),
        Index("ix_usuario_externo_tenant_doc", "tenant_id", "cpf_cnpj"),
    )

    nome: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    cpf_cnpj: Mapped[str] = mapped_column(String(18), nullable=False)
    senha_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    telefone: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    termo_versao: Mapped[str] = mapped_column(String(20), nullable=False)
    termo_aceito_em: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    termo_aceito_ip: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    aprovado: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        comment="Habilitação para peticionar exige conferência pelo órgão",
    )
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    def __repr__(self) -> str:
        return f"<UsuarioExterno {self.email}>"


class Peticionamento(Base, TimestampMixin, TenantMixin):
    __tablename__ = "peticionamentos"
    __table_args__ = (
        Index("ix_peticionamentos_tenant_usuario", "tenant_id", "usuario_externo_id"),
        Index("ix_peticionamentos_tenant_processo", "tenant_id", "processo_id"),
    )

    usuario_externo_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("usuarios_externos.id", ondelete="CASCADE"),
        nullable=False,
    )
    tipo: Mapped[str] = mapped_column(
        String(20), default=TipoPeticionamento.NOVO.value, nullable=False
    )
    tipo_processo_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tipos_processo.id", ondelete="SET NULL"),
        nullable=True,
    )
    processo_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("processos.id", ondelete="SET NULL"),
        nullable=True,
    )
    especificacao: Mapped[str] = mapped_column(String(500), nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), default=StatusPeticionamento.RASCUNHO.value, nullable=False
    )
    concluido_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    recebido: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    def __repr__(self) -> str:
        return f"<Peticionamento {self.tipo} p={self.processo_id}>"


class ReciboProtocolo(Base, TimestampMixin, TenantMixin):
    """Recibo eletrônico de protocolo — horário válido = término do processamento."""

    __tablename__ = "recibos_protocolo"
    __table_args__ = (
        UniqueConstraint("codigo", name="uq_recibo_codigo"),
        Index("ix_recibos_tenant_peticionamento", "tenant_id", "peticionamento_id"),
    )

    peticionamento_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("peticionamentos.id", ondelete="CASCADE"),
        nullable=False,
    )
    codigo: Mapped[str] = mapped_column(String(40), nullable=False)
    horario_conclusao: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    conteudo: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    hash_recibo: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)

    def __repr__(self) -> str:
        return f"<ReciboProtocolo {self.codigo}>"


class Intimacao(Base, TimestampMixin, TenantMixin):
    """Intimação eletrônica a interessado (ciência + prazo + decurso)."""

    __tablename__ = "intimacoes"
    __table_args__ = (
        Index("ix_intimacoes_tenant_processo", "tenant_id", "processo_id"),
        Index("ix_intimacoes_tenant_usuario", "tenant_id", "usuario_externo_id"),
    )

    processo_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("processos.id", ondelete="CASCADE"),
        nullable=False,
    )
    usuario_externo_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("usuarios_externos.id", ondelete="SET NULL"),
        nullable=True,
    )
    destinatario_nome: Mapped[str] = mapped_column(String(255), nullable=False)
    destinatario_documento: Mapped[Optional[str]] = mapped_column(String(18), nullable=True)
    texto: Mapped[str] = mapped_column(Text, nullable=False)
    prazo_dias: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), default=StatusIntimacao.DISPONIBILIZADA.value, nullable=False
    )
    disponibilizada_em: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    consultada_em: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    ciencia_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    ciencia_ip: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)

    def __repr__(self) -> str:
        return f"<Intimacao p={self.processo_id} {self.status}>"


class AcessoExterno(Base, TimestampMixin, TenantMixin):
    """Acesso externo pontual a processo específico (ex.: advogado), com validade."""

    __tablename__ = "acessos_externos"
    __table_args__ = (Index("ix_acessos_externos_tenant_processo", "tenant_id", "processo_id"),)

    processo_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("processos.id", ondelete="CASCADE"),
        nullable=False,
    )
    usuario_externo_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("usuarios_externos.id", ondelete="SET NULL"),
        nullable=True,
    )
    email_externo: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    escopo: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    expira_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    revogado_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    concedido_por_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    def __repr__(self) -> str:
        return f"<AcessoExterno p={self.processo_id} u={self.usuario_externo_id}>"


class Manifestacao(Base, TimestampMixin, SoftDeleteMixin, TenantMixin):
    """Manifestação de ouvidoria (Lei 13.460/2017)."""

    __tablename__ = "manifestacoes"

    tipo: Mapped[str] = mapped_column(String(20), nullable=False)
    texto: Mapped[str] = mapped_column(Text, nullable=False)
    usuario_externo_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("usuarios_externos.id", ondelete="SET NULL"),
        nullable=True,
    )
    anonima: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="RECEBIDA", nullable=False)

    def __repr__(self) -> str:
        return f"<Manifestacao {self.tipo}>"
