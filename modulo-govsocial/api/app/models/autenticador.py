"""Autenticador de documentos com QR Code."""
import uuid
from datetime import date
from typing import Optional

from sqlalchemy import Date, ForeignKey, JSON, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class DocumentoAutenticavel(Base, TimestampMixin):
    """Documento emitido com QR Code para validacao externa."""

    __tablename__ = "documentos_autenticaveis"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    tipo: Mapped[str] = mapped_column(
        String(50), nullable=False,
        comment="DECLARACAO | COMPROVANTE | ATESTADO | TERMO | OFICIO"
    )
    entidade_origem: Mapped[str] = mapped_column(
        String(40), nullable=False,
        comment="benefit_concession | attendance | referral | family"
    )
    entidade_id: Mapped[str] = mapped_column(String(100), nullable=False)
    dados_snapshot: Mapped[dict] = mapped_column(
        JSON, nullable=False,
        comment="Dados congelados no momento da emissao"
    )
    qrcode_uuid: Mapped[str] = mapped_column(
        String(36), nullable=False, unique=True, index=True,
    )
    data_emissao: Mapped[date] = mapped_column(Date, nullable=False)
    emitido_por_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )


class ExportadorDado(Base, TimestampMixin):
    """Exportador de dados com consulta SQL parametrizada."""

    __tablename__ = "exportadores_dados"

    tenant_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=True, index=True,
        comment="NULL = global (todos os tenants)"
    )
    nome: Mapped[str] = mapped_column(String(255), nullable=False)
    descricao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    query_sql: Mapped[str] = mapped_column(Text, nullable=False)
    parametros: Mapped[Optional[dict]] = mapped_column(
        JSON, nullable=True,
        comment="Definicao de filtros: [{nome, tipo, label, obrigatorio}]"
    )
    ativo: Mapped[bool] = mapped_column(default=True)
    global_: Mapped[bool] = mapped_column(
        "global", default=False,
        comment="Disponivel para todos os tenants"
    )


class ExportacaoExecucao(Base, TimestampMixin):
    """Historico de execucao de um exportador."""

    __tablename__ = "exportacoes_execucoes"

    exportador_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("exportadores_dados.id", ondelete="CASCADE"),
        nullable=False,
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    executado_por_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="EXECUTANDO",
        comment="EXECUTANDO | CONCLUIDO | ERRO"
    )
    parametros_usados: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    resultado_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    erro: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    total_linhas: Mapped[Optional[int]] = mapped_column(nullable=True)
