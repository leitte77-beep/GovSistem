import uuid
from typing import TYPE_CHECKING, Optional

from sqlalchemy import CheckConstraint, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.models.enums import MatterRelationType

if TYPE_CHECKING:
    from app.models.matter import Matter
    from app.models.organization import Organization
    from app.models.user import User


class MatterRelation(Base, TimestampMixin):
    """Auditable relationship between two published matters (Fase 2).

    Additive "living" layer. Never mutates a published snapshot: relations may
    be created AFTER an edition is published (e.g. a Portaria of June revoking
    one published in January). The original snapshot/document stays unchanged;
    only this relation table records the current legal relationship.

    ``source_matter_id`` performs the action on ``target_matter_id``
    (source RECTIFIES target = "esta publicação retifica a original").
    """

    __tablename__ = "matter_relations"
    __table_args__ = (
        UniqueConstraint(
            "organization_id",
            "source_matter_id",
            "target_matter_id",
            "relation_type",
            name="uq_matter_relation_org_src_tgt_type",
        ),
        CheckConstraint(
            "source_matter_id <> target_matter_id",
            name="ck_matter_relation_not_self",
        ),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    source_matter_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("matters.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    target_matter_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("matters.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    relation_type: Mapped[MatterRelationType] = mapped_column(
        String(20), nullable=False, index=True
    )
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )

    organization: Mapped["Organization"] = relationship()
    source: Mapped["Matter"] = relationship(
        "Matter", foreign_keys=[source_matter_id]
    )
    target: Mapped["Matter"] = relationship(
        "Matter", foreign_keys=[target_matter_id]
    )
    creator: Mapped["User"] = relationship()

    def __repr__(self) -> str:
        return (
            f"<MatterRelation {self.source_matter_id} "
            f"{self.relation_type} {self.target_matter_id}>"
        )
