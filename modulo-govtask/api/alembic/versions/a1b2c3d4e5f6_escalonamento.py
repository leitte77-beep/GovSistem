"""escalonamento: config e registros de escalonamento de atrasos por tenant

Revision ID: a1b2c3d4e5f6
Revises: 2afbee903290
Create Date: 2026-08-19
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '2afbee903290'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'escalonamento_config',
        sa.Column('organization_id', sa.UUID(), nullable=False),
        sa.Column('ativo', sa.Boolean(), nullable=False),
        sa.Column('dia_responsavel', sa.Integer(), nullable=False),
        sa.Column('dia_coordenador', sa.Integer(), nullable=False),
        sa.Column('dia_gestor', sa.Integer(), nullable=False),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('organization_id'),
    )

    op.create_table(
        'escalonamento_atrasos',
        sa.Column('organization_id', sa.UUID(), nullable=False),
        sa.Column('tarefa_id', sa.UUID(), nullable=False),
        sa.Column('nivel', sa.Integer(), nullable=False),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['tarefa_id'], ['tarefas.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('tarefa_id', 'nivel', name='uq_escalonamento_tarefa_nivel'),
    )
    op.create_index('ix_escalonamento_atrasos_organization_id', 'escalonamento_atrasos', ['organization_id'])
    op.create_index('ix_escalonamento_atrasos_tarefa_id', 'escalonamento_atrasos', ['tarefa_id'])


def downgrade() -> None:
    op.drop_table('escalonamento_atrasos')
    op.drop_table('escalonamento_config')
