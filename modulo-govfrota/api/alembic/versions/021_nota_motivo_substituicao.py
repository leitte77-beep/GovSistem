"""Motivo obrigatório quando o posto substitui uma nota já enviada.

As notas trocadas antes desta migration ficam sem motivo ("não informado").

Revision ID: 021
Revises: 020
Create Date: 2026-09-30
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "021"
down_revision: Union[str, None] = "020"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("abastecimento_notas", sa.Column("motivo_substituicao", sa.String(30), nullable=True))
    op.add_column("abastecimento_notas", sa.Column("motivo_detalhe", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("abastecimento_notas", "motivo_detalhe")
    op.drop_column("abastecimento_notas", "motivo_substituicao")
