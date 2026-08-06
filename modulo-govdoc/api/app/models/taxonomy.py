"""Categorias, campos personalizados por categoria e tags."""

import uuid
from typing import List, Optional

from sqlalchemy import (
    Boolean,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import (
    ActorMixin,
    Base,
    JSONType,
    SoftDeleteMixin,
    TimestampMixin,
    UUIDPrimaryKeyMixin,
)
from app.models.enums import FieldType


class Category(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin, SoftDeleteMixin):
    __tablename__ = "categories"
    __table_args__ = (UniqueConstraint("institution_id", "slug", name="uq_category_slug"),)

    institution_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("institutions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    slug: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    color: Mapped[str] = mapped_column(String(20), default="#1e40af")
    icon: Mapped[str] = mapped_column(String(40), default="file-text")
    default_retention_days: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    requires_expiry: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    fields: Mapped[List["CategoryField"]] = relationship(
        back_populates="category", cascade="all, delete-orphan", order_by="CategoryField.position"
    )


class CategoryField(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "category_fields"
    __table_args__ = (UniqueConstraint("category_id", "key", name="uq_category_field_key"),)

    category_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("categories.id", ondelete="CASCADE"), nullable=False, index=True
    )
    key: Mapped[str] = mapped_column(String(80), nullable=False)
    label: Mapped[str] = mapped_column(String(150), nullable=False)
    field_type: Mapped[str] = mapped_column(
        String(30), default=FieldType.TEXTO.value, nullable=False
    )
    required: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    options: Mapped[Optional[list]] = mapped_column(JSONType, nullable=True)
    help_text: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    category: Mapped["Category"] = relationship(back_populates="fields")


class Tag(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "tags"
    __table_args__ = (UniqueConstraint("institution_id", "slug", name="uq_tag_slug"),)

    institution_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("institutions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    slug: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    color: Mapped[str] = mapped_column(String(20), default="#64748b")


class DocumentTag(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "document_tags"
    __table_args__ = (UniqueConstraint("document_id", "tag_id", name="uq_document_tag"),)

    document_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    tag_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("tags.id", ondelete="CASCADE"), nullable=False, index=True
    )


class FolderTag(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "folder_tags"
    __table_args__ = (UniqueConstraint("folder_id", "tag_id", name="uq_folder_tag"),)

    folder_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("folders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    tag_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("tags.id", ondelete="CASCADE"), nullable=False, index=True
    )


class SavedFilter(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Filtros favoritos salvos pelo usuário."""

    __tablename__ = "saved_filters"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    payload: Mapped[dict] = mapped_column(JSONType, nullable=False)
