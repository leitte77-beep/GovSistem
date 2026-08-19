"""Add mandatory tenant ownership to GovTask resources.

Revision ID: 002
Revises: 001
"""

from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "setores",
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_setores_organization_id", "setores", "organizations",
        ["organization_id"], ["id"], ondelete="CASCADE",
    )
    op.create_index("ix_setores_organization_id", "setores", ["organization_id"])
    op.add_column(
        "templates_fluxo",
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_templates_fluxo_organization_id", "templates_fluxo", "organizations",
        ["organization_id"], ["id"], ondelete="CASCADE",
    )
    op.create_index(
        "ix_templates_fluxo_organization_id", "templates_fluxo", ["organization_id"]
    )
    op.add_column(
        "convenios",
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    # Existing installations are backfilled from the process coordinator. Rows
    # without an identifiable tenant are intentionally rejected instead of being
    # assigned to an arbitrary organization.
    op.execute(
        """
        UPDATE convenios AS c
           SET organization_id = u.organization_id
          FROM users AS u
         WHERE u.id = c.responsavel_id
           AND c.organization_id IS NULL
        """
    )
    if not context.is_offline_mode():
        connection = op.get_bind()
        orphan_count = connection.execute(
            sa.text("SELECT count(*) FROM convenios WHERE organization_id IS NULL")
        ).scalar_one()
        if orphan_count:
            raise RuntimeError(
                f"Cannot migrate {orphan_count} GovTask process(es) without tenant ownership"
            )
    op.alter_column("convenios", "organization_id", nullable=False)
    op.create_foreign_key(
        "fk_convenios_organization_id",
        "convenios",
        "organizations",
        ["organization_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index(
        "ix_convenios_organization_status",
        "convenios",
        ["organization_id", "status"],
    )
    op.create_index(
        "ix_convenios_organization_updated_at",
        "convenios",
        ["organization_id", "updated_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_convenios_organization_updated_at", table_name="convenios")
    op.drop_index("ix_convenios_organization_status", table_name="convenios")
    op.drop_constraint("fk_convenios_organization_id", "convenios", type_="foreignkey")
    op.drop_column("convenios", "organization_id")
    op.drop_index("ix_templates_fluxo_organization_id", table_name="templates_fluxo")
    op.drop_constraint("fk_templates_fluxo_organization_id", "templates_fluxo", type_="foreignkey")
    op.drop_column("templates_fluxo", "organization_id")
    op.drop_index("ix_setores_organization_id", table_name="setores")
    op.drop_constraint("fk_setores_organization_id", "setores", type_="foreignkey")
    op.drop_column("setores", "organization_id")
