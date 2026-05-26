"""add cpf column to users

Revision ID: 7c8d9e0f1a2b
Revises: 6b7c8d9e0f1a
Create Date: 2026-05-26 10:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "7c8d9e0f1a2b"
down_revision: Union[str, None] = "6b7c8d9e0f1a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("cpf", sa.String(length=11), nullable=True))
    op.create_unique_constraint("uq_users_cpf", "users", ["cpf"])


def downgrade() -> None:
    op.drop_constraint("uq_users_cpf", "users", type_="unique")
    op.drop_column("users", "cpf")
