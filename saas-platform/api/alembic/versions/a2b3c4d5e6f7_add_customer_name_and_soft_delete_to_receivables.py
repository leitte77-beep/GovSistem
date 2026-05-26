"""add_customer_name_and_soft_delete_to_receivables

Revision ID: a2b3c4d5e6f7
Revises: f1a2b3c4d5e6
Create Date: 2026-05-25 13:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a2b3c4d5e6f7'
down_revision: Union[str, None] = 'f1a2b3c4d5e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('receivables', sa.Column('customer_name', sa.String(255), nullable=True))
    op.add_column('receivables', sa.Column('description', sa.Text(), nullable=True))
    op.add_column('receivables', sa.Column('category', sa.String(100), nullable=True))
    op.add_column('receivables', sa.Column('document_number', sa.String(100), nullable=True))
    op.add_column('receivables', sa.Column('notes', sa.Text(), nullable=True))
    op.add_column('receivables', sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True))
    op.create_index('ix_receivables_deleted_at', 'receivables', ['deleted_at'])


def downgrade() -> None:
    op.drop_index('ix_receivables_deleted_at', table_name='receivables')
    op.drop_column('receivables', 'deleted_at')
    op.drop_column('receivables', 'notes')
    op.drop_column('receivables', 'document_number')
    op.drop_column('receivables', 'category')
    op.drop_column('receivables', 'description')
    op.drop_column('receivables', 'customer_name')
