import uuid
from typing import Optional

from sqlalchemy import (
    JSON,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class ImportJob(Base, TimestampMixin):
    """Job de importação de dados externos (CadÚnico, migração concorrente)."""

    __tablename__ = "import_jobs"
    __table_args__ = (
        Index("ix_import_tenant_tipo", "tenant_id", "tipo"),
        Index("ix_import_tenant_status", "tenant_id", "status"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    tipo: Mapped[str] = mapped_column(
        String(20), nullable=False, comment="CADUNICO | CONCORRENTE"
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="UPLOADED",
        comment="UPLOADED | PARSING | PARSED | RECONCILING | RECONCILED | APPLIED | ERROR"
    )
    nome_arquivo: Mapped[str] = mapped_column(String(500), nullable=False)
    storage_path: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    configuracao: Mapped[Optional[dict]] = mapped_column(
        JSON, nullable=True, comment="Mapeamento de colunas para CSV de concorrente"
    )

    total_linhas: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    linhas_processadas: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    novos: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    atualizados: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    conflitos: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    erros: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    criado_por_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
    )


class ImportLog(Base, TimestampMixin):
    """Log detalhado de uma linha do import (append-only)."""

    __tablename__ = "import_logs"
    __table_args__ = (
        Index("ix_imlog_tenant_job", "tenant_id", "import_job_id"),
        Index("ix_imlog_tenant_status", "tenant_id", "status"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    import_job_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("import_jobs.id", ondelete="CASCADE"),
        nullable=False,
    )
    linha: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, comment="NOVO | ATUALIZADO | CONFLITO | ERRO"
    )
    nis: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    cpf: Mapped[Optional[str]] = mapped_column(String(14), nullable=True)
    nome: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    mensagem: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    dados_originais: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    family_id_match: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True,
    )
