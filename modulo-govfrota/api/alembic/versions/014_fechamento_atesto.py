"""Atesto e encaminhamento do fechamento.

Revision ID: 014
Revises: 013
Create Date: 2026-09-29
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "014"
down_revision: Union[str, None] = "013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

COLUNAS = [
    sa.Column("atestado_em", sa.DateTime(timezone=True), nullable=True),
    sa.Column("atestado_por_id", sa.Uuid(), nullable=True),
    sa.Column("atestado_por_nome", sa.String(255), nullable=True),
    sa.Column("atestado_cargo", sa.String(150), nullable=True),
    sa.Column("atesto_observacao", sa.Text(), nullable=True),
    sa.Column("atesto_resultado", sa.String(30), nullable=True),
    sa.Column("encaminhado_em", sa.DateTime(timezone=True), nullable=True),
    sa.Column("encaminhado_por_id", sa.Uuid(), nullable=True),
    sa.Column("encaminhamento_referencia", sa.String(100), nullable=True),
]


def upgrade() -> None:
    for c in COLUNAS:
        op.add_column("fechamentos", c)


def downgrade() -> None:
    for c in reversed(COLUNAS):
        op.drop_column("fechamentos", c.name)
