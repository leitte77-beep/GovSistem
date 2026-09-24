"""allow reusing slugs from soft-deleted document models

Revision ID: k8l9m0n1o2p3
Revises: j7k8l9m0n1o2
Create Date: 2026-09-11

Replaces the unconditional organization/slug constraint with a partial unique
index. Historical soft-deleted rows remain intact while active model slugs stay
unique per organization.
"""

import sqlalchemy as sa
from alembic import op

revision = "k8l9m0n1o2p3"
down_revision = "j7k8l9m0n1o2"
branch_labels = None
depends_on = None


def ensure_legacy_slug_constraint_is_safe(connection) -> None:
    duplicate = connection.execute(
        sa.text(
            "SELECT organization_id, slug FROM document_models "
            "GROUP BY organization_id, slug HAVING COUNT(*) > 1 LIMIT 1"
        )
    ).first()
    if duplicate is not None:
        raise RuntimeError(
            "downgrade abortado: existem slugs duplicados no histórico de "
            "document_models; o índice parcial foi preservado"
        )


def upgrade() -> None:
    dialect = op.get_bind().dialect.name
    if dialect == "sqlite":
        with op.batch_alter_table("document_models") as batch_op:
            batch_op.drop_constraint("uq_document_models_org_slug", type_="unique")
    else:
        op.drop_constraint(
            "uq_document_models_org_slug", "document_models", type_="unique"
        )

    op.create_index(
        "uq_document_models_org_slug_active",
        "document_models",
        ["organization_id", "slug"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
        sqlite_where=sa.text("deleted_at IS NULL"),
    )


def downgrade() -> None:
    # Check before dropping the partial index so a failed downgrade never leaves
    # the table without its active-row uniqueness protection.
    ensure_legacy_slug_constraint_is_safe(op.get_bind())
    op.drop_index(
        "uq_document_models_org_slug_active", table_name="document_models"
    )
    dialect = op.get_bind().dialect.name
    if dialect == "sqlite":
        with op.batch_alter_table("document_models") as batch_op:
            batch_op.create_unique_constraint(
                "uq_document_models_org_slug", ["organization_id", "slug"]
            )
    else:
        op.create_unique_constraint(
            "uq_document_models_org_slug",
            "document_models",
            ["organization_id", "slug"],
        )
