"""replace cpf unique constraint with partial index (ignore soft-deleted rows)

Revision ID: c3p4f5p6a7r8
Revises: e2m3a4i5l6p7
Create Date: 2026-06-19
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c3p4f5p6a7r8'
down_revision: Union[str, None] = 'e2m3a4i5l6p7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint("uq_users_cpf", "users", type_="unique")
    op.create_index("ix_users_cpf_active", "users", ["cpf"], unique=True, postgresql_where=sa.text("deleted_at IS NULL AND cpf IS NOT NULL"))


def downgrade() -> None:
    op.drop_index("ix_users_cpf_active", table_name="users", postgresql_where=sa.text("deleted_at IS NULL AND cpf IS NOT NULL"))
    op.create_unique_constraint("uq_users_cpf", "users", ["cpf"])
