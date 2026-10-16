"""Litros do abastecimento com 3 casas decimais (a bomba e a NF-e registram 44,761 L).

Revision ID: 029
Revises: 028
Create Date: 2026-10-15
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "029"
down_revision: Union[str, None] = "028"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "abastecimentos", "quantidade_litros",
        type_=sa.Numeric(12, 3), existing_type=sa.Numeric(12, 2), existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "abastecimentos", "quantidade_litros",
        type_=sa.Numeric(12, 2), existing_type=sa.Numeric(12, 3), existing_nullable=False,
    )
