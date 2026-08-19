"""tarefas_avancadas: historico de prazos e prazo interno

Revision ID: 6b0e76b849c9
Revises: c3412d479b8a
Create Date: 2026-08-19
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '6b0e76b849c9'
down_revision: Union[str, None] = 'c3412d479b8a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'tarefas_prazos_historico',
        sa.Column('tarefa_id', sa.UUID(), nullable=False),
        sa.Column('prazo_anterior', sa.DateTime(timezone=True), nullable=True),
        sa.Column('prazo_novo', sa.DateTime(timezone=True), nullable=True),
        sa.Column('definido_por_id', sa.UUID(), nullable=False),
        sa.Column('motivo', sa.Text(), nullable=True),
        sa.Column('tipo', sa.String(length=20), nullable=False),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['definido_por_id'], ['users.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['tarefa_id'], ['tarefas.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_tarefas_prazos_historico_tarefa_id', 'tarefas_prazos_historico', ['tarefa_id'])
    op.add_column('tarefas', sa.Column('prazo_interno', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('tarefas', 'prazo_interno')
    op.drop_table('tarefas_prazos_historico')
