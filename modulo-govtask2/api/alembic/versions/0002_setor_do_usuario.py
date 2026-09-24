"""Setor de lotação do usuário: a caixa compartilhada do departamento.

Revision ID: 0002_setor_usuario
Revises: 0001_inicial
Create Date: 2026-09-23
"""

import sqlalchemy as sa
from alembic import op

revision = "0002_setor_usuario"
down_revision = "0001_inicial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("setor", sa.String(30), nullable=True))
    op.create_index("ix_users_setor", "users", ["setor"])


def downgrade() -> None:
    op.drop_index("ix_users_setor", table_name="users")
    op.drop_column("users", "setor")
