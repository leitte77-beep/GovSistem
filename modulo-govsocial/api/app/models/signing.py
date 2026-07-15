"""Credenciais de assinatura digital por tenant (Fase 3.13)."""

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, SoftDeleteMixin


class SigningCredential(Base, TimestampMixin, SoftDeleteMixin):
    """Certificado digital A1/A3 armazenado por tenant para assinatura de documentos."""

    __tablename__ = "signing_credentials"

    id: Mapped[str] = mapped_column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    tenant_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    label: Mapped[str] = mapped_column(String(100), nullable=False)
    tipo: Mapped[str] = mapped_column(String(10), nullable=False, default="A1", comment="A1 | A3")
    pfx_enc: Mapped[str] = mapped_column(Text, nullable=False, comment="PFX criptografado em base64")
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    subject: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    serial_number: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    issuer: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    valid_from: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    valid_to: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class DocumentoAssinatura(Base, TimestampMixin):
    """Documento assinado digitalmente (CCCXVI)."""

    __tablename__ = "documentos_assinaturas"

    id: Mapped[str] = mapped_column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    tenant_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    documento_tipo: Mapped[str] = mapped_column(String(50), nullable=False, comment="atendimento | beneficio | encaminhamento | rma")
    documento_id: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=True), nullable=True)
    pdf_signed_base64: Mapped[str] = mapped_column(Text, nullable=False)
    sha256_signed: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    sha256_original: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    certificate_subject: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    certificate_serial: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    verification_code: Mapped[Optional[str]] = mapped_column(String(12), nullable=True)
    signature_format: Mapped[str] = mapped_column(String(20), nullable=False, default="PAdES-AD-RB")
    signed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    registrado_por_id: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=True), nullable=True)
