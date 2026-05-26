"""add_read_field_to_audit_events

Revision ID: a1b2c3d4e5f6
Revises: f3a2e1b4c5d6
Create Date: 2026-05-20 10:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'b1c2d3e4f5a6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "audit_events",
        sa.Column("read", sa.Boolean(), nullable=False, server_default=sa.text("false"),
                  comment="Whether the notification has been read by the user"),
    )


def downgrade() -> None:
    op.drop_column("audit_events", "read")
