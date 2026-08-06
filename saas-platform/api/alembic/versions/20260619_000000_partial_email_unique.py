"""replace email unique constraint with partial index (ignore soft-deleted rows)

Revision ID: e2m3a4i5l6p7
Revises: f1p2r3e4s5t6
Create Date: 2026-06-19
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e2m3a4i5l6p7'
down_revision: Union[str, None] = 'f1p2r3e4s5t6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_index("ix_users_email", table_name="users")
    op.create_index("ix_users_email_active", "users", ["email"], unique=True, postgresql_where=sa.text("deleted_at IS NULL"))


def downgrade() -> None:
    op.drop_index("ix_users_email_active", table_name="users", postgresql_where=sa.text("deleted_at IS NULL"))
    op.create_index("ix_users_email", "users", ["email"], unique=True)
