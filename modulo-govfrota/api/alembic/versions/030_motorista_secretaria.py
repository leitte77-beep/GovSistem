"""Motorista vinculado a uma secretaria (vazio = livre para qualquer veículo).

Revision ID: 030
Revises: 029
Create Date: 2026-10-16
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "030"
down_revision: Union[str, None] = "029"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "motoristas",
        sa.Column("unidade_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("unidades.id"), nullable=True),
    )
    op.create_index("ix_motoristas_unidade_id", "motoristas", ["unidade_id"])


def downgrade() -> None:
    op.drop_index("ix_motoristas_unidade_id", table_name="motoristas")
    op.drop_column("motoristas", "unidade_id")
