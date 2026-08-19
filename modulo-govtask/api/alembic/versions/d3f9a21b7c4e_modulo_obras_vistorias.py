"""modulo_obras_vistorias: vistorias e inspecoes de obra

Revision ID: d3f9a21b7c4e
Revises: c3412d479b8a
Create Date: 2026-08-19
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'd3f9a21b7c4e'
down_revision: Union[str, None] = 'c3412d479b8a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'vistorias_obra',
        sa.Column('obra_id', sa.UUID(), nullable=False),
        sa.Column('data', sa.DateTime(timezone=True), nullable=True),
        sa.Column('tipo', sa.String(length=40), nullable=True),
        sa.Column('vistoriador', sa.String(length=255), nullable=True),
        sa.Column('orgao_vistoriador', sa.String(length=255), nullable=True),
        sa.Column('status', sa.String(length=40), nullable=True),
        sa.Column('protocolo', sa.String(length=100), nullable=True),
        sa.Column('observacoes', sa.Text(), nullable=True),
        sa.Column('nao_conformidades', sa.Text(), nullable=True),
        sa.Column('recomendacoes', sa.Text(), nullable=True),
        sa.Column('registrado_por_id', sa.UUID(), nullable=True),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['obra_id'], ['obras.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['registrado_por_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_vistorias_obra_obra_id', 'vistorias_obra', ['obra_id'])


def downgrade() -> None:
    op.drop_index('ix_vistorias_obra_obra_id', table_name='vistorias_obra')
    op.drop_table('vistorias_obra')
