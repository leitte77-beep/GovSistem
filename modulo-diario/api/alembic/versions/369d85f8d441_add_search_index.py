"""add_search_index

Revision ID: 369d85f8d441
Revises: 539957eacd12
Create Date: 2026-05-15 17:11:56.092870
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import TSVECTOR, UUID


revision: str = '369d85f8d441'
down_revision: Union[str, None] = '539957eacd12'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS unaccent")

    op.create_table('search_index',
        sa.Column('id', UUID(as_uuid=True), nullable=False),
        sa.Column('matter_id', UUID(as_uuid=True), nullable=False),
        sa.Column('edition_id', UUID(as_uuid=True), nullable=True),
        sa.Column('title', sa.Text(), nullable=False),
        sa.Column('act_type', sa.String(100), nullable=False),
        sa.Column('org_unit', sa.String(100), nullable=False),
        sa.Column('plain_text', sa.Text(), nullable=False),
        sa.Column('edition_number', sa.String(20), nullable=False),
        sa.Column('publication_date', sa.Date(), nullable=True),
        sa.Column('search_vector', TSVECTOR(), nullable=True),
        sa.ForeignKeyConstraint(['edition_id'], ['editions.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['matter_id'], ['matters.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_search_index_matter_id', 'search_index', ['matter_id'])
    op.create_index('ix_search_index_edition_id', 'search_index', ['edition_id'])
    op.create_index(
        'ix_search_index_vector', 'search_index', ['search_vector'],
        postgresql_using='gin',
    )


def downgrade() -> None:
    op.drop_index('ix_search_index_vector', table_name='search_index')
    op.drop_index('ix_search_index_edition_id', table_name='search_index')
    op.drop_index('ix_search_index_matter_id', table_name='search_index')
    op.drop_table('search_index')
