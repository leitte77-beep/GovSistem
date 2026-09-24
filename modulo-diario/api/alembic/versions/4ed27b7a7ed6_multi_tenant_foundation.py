"""multi-tenant foundation

Add organization_id to signing_documents, signing_jobs, search_index.
Add tenant_domains table.
Update edition unique constraint to include organization_id.

Revision ID: 4ed27b7a7ed6
Revises: b2c3d4e5f6a7
Create Date: 2026-05-21 22:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = '4ed27b7a7ed6'
down_revision: Union[str, None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── 1. Create tenant_domains table ─────────────────────────────────────
    op.create_table(
        "tenant_domains",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("organizations.id", ondelete="CASCADE"),
                  nullable=False, index=True),
        sa.Column("domain", sa.String(255), unique=True, nullable=False, index=True),
        sa.Column("is_primary", sa.Boolean(), default=False, nullable=False),
        sa.Column("is_active", sa.Boolean(), default=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
    )

    # ── 2. Add organization_id to signing_documents ────────────────────────
    op.add_column(
        "signing_documents",
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=True),
    )

    # Backfill: copy org_id from linked edition
    op.execute("""
        UPDATE signing_documents sd
        SET organization_id = e.organization_id
        FROM editions e
        WHERE sd.edition_id = e.id
    """)

    # Remove orphan records (standalone signing without edition)
    op.execute("""
        DELETE FROM signing_documents WHERE organization_id IS NULL
    """)

    op.alter_column("signing_documents", "organization_id",
                    nullable=False,
                    existing_type=postgresql.UUID(as_uuid=True))
    op.create_foreign_key(
        "fk_signing_documents_organization",
        "signing_documents", "organizations",
        ["organization_id"], ["id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_signing_documents_organization_id",
                    "signing_documents", ["organization_id"])

    # ── 3. Add organization_id to signing_jobs ─────────────────────────────
    op.add_column(
        "signing_jobs",
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=True),
    )

    # Backfill: copy org_id from linked document
    op.execute("""
        UPDATE signing_jobs sj
        SET organization_id = sd.organization_id
        FROM signing_documents sd
        WHERE sj.document_id = sd.id
    """)

    # Remove orphan records
    op.execute("""
        DELETE FROM signing_jobs WHERE organization_id IS NULL
    """)

    op.alter_column("signing_jobs", "organization_id",
                    nullable=False,
                    existing_type=postgresql.UUID(as_uuid=True))
    op.create_foreign_key(
        "fk_signing_jobs_organization",
        "signing_jobs", "organizations",
        ["organization_id"], ["id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_signing_jobs_organization_id",
                    "signing_jobs", ["organization_id"])

    # ── 4. Add organization_id to search_index ─────────────────────────────
    op.add_column(
        "search_index",
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=True),
    )

    # Backfill: copy org_id from linked matter or edition
    op.execute("""
        UPDATE search_index si
        SET organization_id = m.organization_id
        FROM matters m
        WHERE si.matter_id = m.id
    """)
    op.execute("""
        UPDATE search_index si
        SET organization_id = e.organization_id
        FROM editions e
        WHERE si.edition_id = e.id
          AND si.organization_id IS NULL
    """)

    op.execute("""
        DELETE FROM search_index WHERE organization_id IS NULL
    """)

    op.alter_column("search_index", "organization_id",
                    nullable=False,
                    existing_type=postgresql.UUID(as_uuid=True))
    op.create_foreign_key(
        "fk_search_index_organization",
        "search_index", "organizations",
        ["organization_id"], ["id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_search_index_organization_id",
                    "search_index", ["organization_id"])

    # ── 5. Update edition unique constraint ────────────────────────────────
    op.drop_constraint("uq_edition_year_number_type", "editions", type_="unique")
    op.create_unique_constraint(
        "uq_edition_org_year_number_type",
        "editions",
        ["organization_id", "year", "number", "type"],
    )


def downgrade() -> None:
    # Revert edition unique constraint
    op.drop_constraint("uq_edition_org_year_number_type", "editions", type_="unique")
    op.create_unique_constraint(
        "uq_edition_year_number_type",
        "editions",
        ["year", "number", "type"],
    )

    # Remove search_index org_id
    op.drop_index("ix_search_index_organization_id", table_name="search_index")
    op.drop_constraint("fk_search_index_organization", "search_index", type_="foreignkey")
    op.drop_column("search_index", "organization_id")

    # Remove signing_jobs org_id
    op.drop_index("ix_signing_jobs_organization_id", table_name="signing_jobs")
    op.drop_constraint("fk_signing_jobs_organization", "signing_jobs", type_="foreignkey")
    op.drop_column("signing_jobs", "organization_id")

    # Remove signing_documents org_id
    op.drop_index("ix_signing_documents_organization_id", table_name="signing_documents")
    op.drop_constraint("fk_signing_documents_organization", "signing_documents", type_="foreignkey")
    op.drop_column("signing_documents", "organization_id")

    # Drop tenant_domains
    op.drop_table("tenant_domains")
