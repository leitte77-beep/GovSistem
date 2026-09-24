"""add_supplier_name_to_payables

Revision ID: f1a2b3c4d5e6
Revises: 5bb1d6dbf632
Create Date: 2026-05-25 12:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f1a2b3c4d5e6'
down_revision: Union[str, None] = '5bb1d6dbf632'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('payables', sa.Column('supplier_name', sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column('payables', 'supplier_name')
