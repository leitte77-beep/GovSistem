"""Add role_alvo column to notificacoes for role-targeted notifications.

Revision ID: 034
Revises: 033
Create Date: 2026-07-15
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "034"
down_revision: Union[str, None] = "033"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "notificacoes",
        sa.Column(
            "role_alvo",
            sa.String(30),
            nullable=True,
            comment="Papel alvo (null = todos). ADMIN, gestor_municipal, tecnico_superior, etc.",
        ),
    )
    op.create_index("ix_notif_role_alvo", "notificacoes", ["role_alvo"])


def downgrade() -> None:
    op.drop_index("ix_notif_role_alvo", table_name="notificacoes")
    op.drop_column("notificacoes", "role_alvo")
