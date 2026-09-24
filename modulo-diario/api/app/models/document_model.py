"""Modelos de documento por organização (DocumentModel / DocumentModelVersion).

Espelha o padrão já adotado por ``PublicationTemplate``/Version: uma entidade
de cabeçalho + versões imutáveis; a versão **ativa** não muda — alterações
criam uma nova versão. Aqui a config guardada é o ``DocumentModelConfig``
validado (campos variáveis, textos fixos, condicionais). As matérias antigas
permanecem ligadas à versão do modelo que as gerou.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import (
    UUID,
    Boolean,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.document_model.schemas import DM_STATUS_ACTIVE, DM_STATUS_DRAFT
from app.models.base import JSONB, Base, SoftDeleteMixin, TimestampMixin

if TYPE_CHECKING:
    from app.models.organization import Organization
    from app.models.user import User


class DocumentModel(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "document_models"
    __table_args__ = (
        Index(
            "uq_document_models_org_slug_active",
            "organization_id",
            "slug",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
            sqlite_where=text("deleted_at IS NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    slug: Mapped[str] = mapped_column(String(120), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    purpose: Mapped[str] = mapped_column(String(200), nullable=False)
    document_type: Mapped[str] = mapped_column(String(50), nullable=False, default="outro")
    status: Mapped[str] = mapped_column(
        String(20), default=DM_STATUS_DRAFT, nullable=False, index=True
    )
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    active_version: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True, comment="Versão atualmente ativa (imutável)"
    )
    parent_model_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("document_models.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        comment="Modelo base herdado (cabeçalho/rodapé/estrutura).",
    )
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    organization: Mapped["Organization"] = relationship("Organization")
    creator: Mapped[Optional["User"]] = relationship("User")
    parent: Mapped[Optional["DocumentModel"]] = relationship(
        "DocumentModel",
        remote_side="DocumentModel.id",
        backref="derived_models",
    )
    versions: Mapped[List["DocumentModelVersion"]] = relationship(
        "DocumentModelVersion",
        back_populates="document_model",
        lazy="selectin",
        order_by="DocumentModelVersion.version_number",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<DocumentModel {self.slug} ({self.status} v{self.active_version})>"


class DocumentModelVersion(Base, TimestampMixin):
    __tablename__ = "document_model_versions"
    __table_args__ = (
        UniqueConstraint(
            "document_model_id", "version_number", name="uq_document_model_version_number"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_model_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("document_models.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default=DM_STATUS_DRAFT, nullable=False)
    config_json: Mapped[dict] = mapped_column(
        JSONB, nullable=False, comment="DocumentModelConfig validado (JSON)"
    )
    layout_json: Mapped[Optional[dict]] = mapped_column(
        JSONB,
        nullable=True,
        comment="DocumentLayout (visual: fontes, margens, cabeçalho, rodapé).",
    )
    config_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    change_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    document_model: Mapped["DocumentModel"] = relationship(
        "DocumentModel", back_populates="versions"
    )
    creator: Mapped[Optional["User"]] = relationship("User")

    def __repr__(self) -> str:  # pragma: no cover
        return f"<DocumentModelVersion v{self.version_number} ({self.status})>"


class DocumentModelBlock(Base, TimestampMixin, SoftDeleteMixin):
    """Reusable block library (org-scoped).

    Ex.: "Cabeçalho Prefeitura", "Registre-se e Publique-se", "Paço Municipal".
    ``content_json`` holds the block payload validated by the engine when used.
    """

    __tablename__ = "document_model_blocks"
    __table_args__ = (
        UniqueConstraint("organization_id", "name", name="uq_document_model_blocks_org_name"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    kind: Mapped[str] = mapped_column(String(30), nullable=False, default="text")
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    content_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    organization: Mapped["Organization"] = relationship("Organization")
    creator: Mapped[Optional["User"]] = relationship("User")

    def __repr__(self) -> str:  # pragma: no cover
        return f"<DocumentModelBlock {self.name} ({self.kind})>"


class DocumentModelTrainingFile(Base, TimestampMixin, SoftDeleteMixin):
    """Reference document used to teach a model ("Aprender com documentos").

    The file bytes live in object storage; ``extracted_text`` and
    ``ai_analysis`` hold the extraction/IA proposal. Only ``analyzed`` files with
    ``used_by_ai`` are eligible to feed the AI.
    """

    __tablename__ = "document_model_training_files"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    document_model_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("document_models.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    mime_type: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    size_bytes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    storage_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    sha256: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="uploaded")
    extracted_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ai_analysis: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    used_by_ai: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    organization: Mapped["Organization"] = relationship("Organization")
    document_model: Mapped[Optional["DocumentModel"]] = relationship("DocumentModel")
    creator: Mapped[Optional["User"]] = relationship("User")

    def __repr__(self) -> str:  # pragma: no cover
        return f"<DocumentModelTrainingFile {self.filename} ({self.status})>"


__all__ = [
    "DocumentModel",
    "DocumentModelVersion",
    "DocumentModelBlock",
    "DocumentModelTrainingFile",
    "DM_STATUS_ACTIVE",
    "DM_STATUS_DRAFT",
]
