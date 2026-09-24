import uuid
from typing import Optional

from sqlalchemy import ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, SoftDeleteMixin, TimestampMixin


class Anexo(Base, TimestampMixin, SoftDeleteMixin):
    """Arquivo anexado (fotos de abastecimento, notas fiscais, documentos)."""

    __tablename__ = "anexos"
    __table_args__ = (
        Index("ix_anexos_org", "organization_id", "created_at"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    nome_arquivo: Mapped[str] = mapped_column(String(255), nullable=False)
    caminho: Mapped[str] = mapped_column(String(500), nullable=False)
    mime_type: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    tamanho_bytes: Mapped[Optional[int]] = mapped_column(nullable=True)
    tipo: Mapped[str] = mapped_column(String(50), default="OUTRO", nullable=False)
    enviado_por_usuario_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    enviado_por_motorista_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)

    @property
    def url(self) -> str:
        return f"/api/govfrota/uploads/{self.id}"
