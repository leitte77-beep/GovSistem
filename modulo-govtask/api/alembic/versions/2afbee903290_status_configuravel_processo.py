"""status_configuravel_processo: status de processo configurável por tenant

Revision ID: 2afbee903290
Revises: 6b0e76b849c9
Create Date: 2026-08-19
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '2afbee903290'
down_revision: Union[str, None] = '6b0e76b849c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'processos_status',
        sa.Column('organization_id', sa.UUID(), nullable=True),
        sa.Column('chave', sa.String(length=50), nullable=False),
        sa.Column('rotulo', sa.String(length=100), nullable=False),
        sa.Column('ordem', sa.Integer(), nullable=False),
        sa.Column('cor', sa.String(length=30), nullable=True),
        sa.Column('is_final', sa.Boolean(), nullable=False),
        sa.Column('is_system', sa.Boolean(), nullable=False),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_processos_status_organization_id', 'processos_status', ['organization_id'])
    op.create_index('ix_processos_status_chave', 'processos_status', ['chave'])


def downgrade() -> None:
    op.drop_table('processos_status')
