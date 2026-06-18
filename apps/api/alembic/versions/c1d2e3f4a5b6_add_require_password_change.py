"""add require_password_change to users

Revision ID: c1d2e3f4a5b6
Revises: 7959f842d2c5
Create Date: 2026-06-17
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c1d2e3f4a5b6"
down_revision: Union[str, None] = "7959f842d2c5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "require_password_change",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
            comment="Forces password change on next login",
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "require_password_change")
