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
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.document_model.schemas import DM_STATUS_ACTIVE, DM_STATUS_DRAFT
from app.models.base import JSONB, Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.organization import Organization
    from app.models.user import User


class DocumentModel(Base, TimestampMixin):
    __tablename__ = "document_models"
    __table_args__ = (
        UniqueConstraint("organization_id", "slug", name="uq_document_models_org_slug"),
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
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    organization: Mapped["Organization"] = relationship("Organization")
    creator: Mapped[Optional["User"]] = relationship("User")
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


__all__ = [
    "DocumentModel",
    "DocumentModelVersion",
    "DM_STATUS_ACTIVE",
    "DM_STATUS_DRAFT",
]
