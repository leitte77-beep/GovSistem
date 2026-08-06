"""add cpf column to users

Revision ID: d5e6f7a8b9c0
Revises: fin_consolidated_migration
Create Date: 2026-05-26 10:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d5e6f7a8b9c0"
down_revision: Union[str, None] = "fin_consolidated_migration"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("cpf", sa.String(length=11), nullable=True))
    op.create_unique_constraint("uq_users_cpf", "users", ["cpf"])


def downgrade() -> None:
    op.drop_constraint("uq_users_cpf", "users", type_="unique")
    op.drop_column("users", "cpf")
