"""Credenciais de assinatura digital por tenant (Fase 3.13)."""

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSON, UUID
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


class AssinaturaDocumento(Base, TimestampMixin):
    """Fluxo completo de assinatura digital: solicitação → assinatura → verificação → certificado."""

    __tablename__ = "assinaturas_documentos"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    documento_tipo: Mapped[str] = mapped_column(
        String(50), nullable=False,
        comment="Tipo do documento: DECLARACAO | COMPROVANTE | ATESTADO | TERMO | OFICIO | RELATORIO",
    )
    documento_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True,
        comment="ID da entidade de origem (atendimento, beneficio, encaminhamento etc.)",
    )
    titulo: Mapped[str] = mapped_column(
        String(255), nullable=False,
        comment="Título descritivo do documento",
    )
    hash_documento: Mapped[Optional[str]] = mapped_column(
        String(64), nullable=True,
        comment="Hash SHA-256 do conteúdo do documento",
    )
    dados_documento: Mapped[Optional[dict]] = mapped_column(
        JSON, nullable=True,
        comment="Snapshot do conteúdo do documento no momento da solicitação",
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="PENDENTE",
        comment="PENDENTE | ASSINADO | EXPIRADO | RECUSADO",
    )
    signatario_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        comment="Usuário que deve assinar / que assinou",
    )
    signatario_nome: Mapped[Optional[str]] = mapped_column(
        String(200), nullable=True,
        comment="Nome do signatário no momento da assinatura",
    )
    signatario_cpf: Mapped[Optional[str]] = mapped_column(
        String(14), nullable=True,
        comment="CPF do signatário (quando aplicável)",
    )
    data_assinatura: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True,
        comment="Timestamp do servidor no momento da assinatura",
    )
    ip_assinatura: Mapped[Optional[str]] = mapped_column(
        String(45), nullable=True,
        comment="Endereço IP do signatário no momento da assinatura",
    )
    assinatura_base64: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True,
        comment="Representação da assinatura digital em base64",
    )
    certificado_url: Mapped[Optional[str]] = mapped_column(
        String(500), nullable=True,
        comment="URL do certificado digital PDF/A gerado",
    )
    certificado_sha256: Mapped[Optional[str]] = mapped_column(
        String(64), nullable=True,
        comment="Hash SHA-256 do certificado PDF gerado",
    )
    validade_dias: Mapped[int] = mapped_column(
        Integer, nullable=False, default=365,
        comment="Validade da assinatura em dias a partir da data de assinatura",
    )
    metadata_json: Mapped[Optional[dict]] = mapped_column(
        JSON, nullable=True,
        comment="Metadados adicionais (ex: coordenadas geográficas, dispositivo, user-agent)",
    )
    verificacao_status: Mapped[Optional[str]] = mapped_column(
        String(20), nullable=True, default="NAO_VERIFICADO",
        comment="Status da última verificação: VALIDO | INVALIDO | EXPIRADO | ALTERADO | NAO_VERIFICADO",
    )
    verificacao_data: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True,
        comment="Data da última verificação de integridade",
    )
    solicitado_por_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        comment="Usuário que solicitou a assinatura",
    )
    motivo: Mapped[Optional[str]] = mapped_column(
        String(500), nullable=True,
        comment="Justificativa / motivo da solicitação de assinatura",
    )
    assinatura_documento_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("documentos_assinaturas.id", ondelete="SET NULL"),
        nullable=True,
        comment="Referência ao registro de assinatura ICP-Brasil (quando aplicável)",
    )
