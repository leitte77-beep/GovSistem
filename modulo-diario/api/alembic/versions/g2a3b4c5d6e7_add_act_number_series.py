"""add act_number_series (transactional act numbering)

Revision ID: g2a3b4c5d6e7
Revises: f1a2b3c4d5e6
Create Date: 2026-09-09

Tabela nova (aditiva) para numeração transacional de atos por
(organização, tipo de ato, ano). O contador é monotônico e nunca diminui:
números cancelados/não usados não são reutilizados automaticamente. Rollback
remove apenas esta tabela; nunca apaga matérias/publicações.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "g2a3b4c5d6e7"
down_revision = "f1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "act_number_series",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "act_type_id",
            UUID(as_uuid=True),
            sa.ForeignKey("act_types.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("current", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "organization_id",
            "act_type_id",
            "year",
            name="uq_act_number_series_org_type_year",
        ),
    )
    op.create_index("ix_act_number_series_org", "act_number_series", ["organization_id"])


def downgrade() -> None:
    op.drop_index("ix_act_number_series_org", table_name="act_number_series")
    op.drop_table("act_number_series")
