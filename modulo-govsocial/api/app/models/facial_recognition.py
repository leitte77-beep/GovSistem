import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Date, DateTime, ForeignKey, Index, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.models.base import Base, SoftDeleteMixin, TimestampMixin

STATUS_FACE = ("ATIVO", "INATIVO", "PENDENTE_VERIFICACAO")
METODO_VERIFICACAO = ("FOTO_SIMPLES", "BIOMETRIA")


class FacialRecognition(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "facial_recognition"
    __table_args__ = (
        UniqueConstraint("tenant_id", "person_id", name="uq_facial_tenant_person"),
        Index("ix_facial_tenant_status", "tenant_id", "status"),
        Index("ix_facial_tenant_pendentes", "tenant_id", "status"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    person_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("persons.id", ondelete="CASCADE"),
        nullable=False,
    )

    foto_url: Mapped[Optional[str]] = mapped_column(
        String(1024), nullable=True, comment="URL/URI da foto armazenada"
    )

    face_encoding: Mapped[Optional[dict]] = mapped_column(
        JSON, nullable=True,
        comment="Face embeddings (placeholder para AWS Rekognition/Azure Face API/FaceNet)",
    )

    status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="PENDENTE_VERIFICACAO",
        comment="ATIVO | INATIVO | PENDENTE_VERIFICACAO",
    )

    metodo_verificacao: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="FOTO_SIMPLES",
        comment="FOTO_SIMPLES | BIOMETRIA",
    )

    data_cadastro: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    data_ultima_verificacao: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    def __repr__(self) -> str:
        return f"<FacialRecognition person={self.person_id} status={self.status}>"
