"""add_semantic_document_engine

Additive migration for the semantic document engine:
semantic fields on matters + publication templates, template versions,
edition publication snapshots and publication artifacts.

Revision ID: a1f5b7c9d2e4
Revises: 9a8b7c6d5e4f
Create Date: 2026-09-01
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "a1f5b7c9d2e4"
down_revision: Union[str, None] = "9a8b7c6d5e4f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _add_matter_columns() -> None:
    op.add_column(
        "matters",
        sa.Column("semantic_content", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.add_column(
        "matters",
        sa.Column("semantic_schema_version", sa.Integer(), nullable=True),
    )
    op.add_column(
        "matters",
        sa.Column("source_hash", sa.String(64), nullable=True),
    )
    op.add_column(
        "matters",
        sa.Column("text_integrity_hash", sa.String(64), nullable=True),
    )
    op.add_column(
        "matters",
        sa.Column("classification_status", sa.String(20), nullable=True),
    )
    op.add_column(
        "matters",
        sa.Column("template_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "matters",
        sa.Column("template_version", sa.Integer(), nullable=True),
    )


def _drop_matter_columns() -> None:
    for col in ("template_version", "template_id", "classification_status",
                "text_integrity_hash", "source_hash", "semantic_schema_version",
                "semantic_content"):
        op.drop_column("matters", col)


def upgrade() -> None:
    _add_matter_columns()

    op.create_table(
        "publication_templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("slug", sa.String(100), nullable=False),
        sa.Column("document_type", sa.String(50), nullable=False),
        sa.Column("is_default", sa.Boolean(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("active_version", sa.Integer(), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_publication_templates_organization_id", "publication_templates", ["organization_id"])
    op.create_index("ix_publication_templates_status", "publication_templates", ["status"])

    # FK must be added AFTER the referenced table exists.
    op.create_foreign_key(
        "fk_matters_template_id_publication_templates",
        "matters", "publication_templates",
        ["template_id"], ["id"], ondelete="SET NULL",
    )

    op.create_table(
        "publication_template_versions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("template_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("config_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("config_hash", sa.String(64), nullable=False),
        sa.Column("asset_snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("change_reason", sa.Text(), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["template_id"], ["publication_templates.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("template_id", "version_number", name="uq_tmpl_version_number"),
    )
    op.create_index("ix_publication_template_versions_template_id", "publication_template_versions", ["template_id"])

    op.create_table(
        "edition_publication_snapshots",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("edition_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("content", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("content_manifest_hash", sa.String(64), nullable=False),
        sa.Column("frozen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("frozen_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("is_valid", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["edition_id"], ["editions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["frozen_by"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_edition_publication_snapshots_edition_id", "edition_publication_snapshots", ["edition_id"])
    op.create_index("ix_edition_publication_snapshots_organization_id", "edition_publication_snapshots", ["organization_id"])

    op.create_table(
        "publication_artifacts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("snapshot_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("artifact_type", sa.String(30), nullable=False),
        sa.Column("storage_path", sa.String(1000), nullable=False),
        sa.Column("sha256", sa.String(64), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("mime_type", sa.String(200), nullable=False),
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("renderer", sa.String(100), nullable=True),
        sa.Column("renderer_version", sa.String(50), nullable=True),
        sa.Column("validation_status", sa.String(50), nullable=True),
        sa.Column("is_preview", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["snapshot_id"], ["edition_publication_snapshots.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_publication_artifacts_snapshot_id", "publication_artifacts", ["snapshot_id"])


def downgrade() -> None:
    op.drop_constraint("fk_matters_template_id_publication_templates", "matters", type_="foreignkey")
    op.drop_table("publication_artifacts")
    op.drop_table("edition_publication_snapshots")
    op.drop_table("publication_template_versions")
    op.drop_table("publication_templates")
    _drop_matter_columns()
