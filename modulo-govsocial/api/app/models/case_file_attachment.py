import uuid
from typing import Optional

from sqlalchemy import BigInteger, ForeignKey, Index, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, SoftDeleteMixin, TimestampMixin


class CaseFileAttachment(Base, TimestampMixin, SoftDeleteMixin):
    """Anexo de um prontuário/atendimento (upload com verificação de tipo)."""

    __tablename__ = "case_file_attachments"
    __table_args__ = (
        Index("ix_attachments_tenant_casefile", "tenant_id", "case_file_id"),
        Index("ix_attachments_tenant_attendance", "tenant_id", "attendance_id"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    case_file_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("case_files.id", ondelete="CASCADE"),
        nullable=False,
    )
    attendance_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("attendances.id", ondelete="SET NULL"),
        nullable=True,
    )
    nome_arquivo: Mapped[str] = mapped_column(String(500), nullable=False)
    tipo_documento: Mapped[str] = mapped_column(
        String(30), nullable=False, default="OUTRO"
    )
    storage_path: Mapped[str] = mapped_column(String(1000), nullable=False)
    content_type: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    tamanho_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    versao: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    enviado_por_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    def __repr__(self) -> str:
        return f"<CaseFileAttachment {self.nome_arquivo}>"
