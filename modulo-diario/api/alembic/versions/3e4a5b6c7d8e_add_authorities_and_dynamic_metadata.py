"""add authorities registry + matter metadata/responsible_id

Revision ID: 3e4a5b6c7d8e
Revises: c5a7e9f1b3d5
Create Date: 2026-09-02

- New ``authorities`` table (tenant-scoped institutional signatories).
- ``matters.metadata`` JSONB (extensible per-act-type dynamic field values).
- ``matters.responsible_id`` FK -> authorities.id (provenance; nullable so
  legacy free-text matters keep working). responsible_name/role remain the
  frozen snapshot copied at save time.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "3e4a5b6c7d8e"
down_revision = "c5a7e9f1b3d5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "authorities",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "org_unit_id",
            UUID(as_uuid=True),
            sa.ForeignKey("org_units.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("role", sa.String(255), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("valid_from", sa.Date(), nullable=True),
        sa.Column("valid_until", sa.Date(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_authorities_organization_id", "authorities", ["organization_id"]
    )

    op.add_column(
        "matters",
        sa.Column(
            "responsible_id",
            UUID(as_uuid=True),
            sa.ForeignKey("authorities.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "matters",
        sa.Column("metadata", JSONB(), nullable=True),
    )
    op.add_column(
        "matters",
        sa.Column("review_reason", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("matters", "review_reason")
    op.drop_column("matters", "metadata")
    op.drop_column("matters", "responsible_id")
    op.drop_index("ix_authorities_organization_id", table_name="authorities")
    op.drop_table("authorities")
