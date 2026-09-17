"""diario de obra: campos do canteiro + vinculo de documento na prestacao

Revision ID: f7a1c2d3e4b5
Revises: a2b3c4d5e6f7, d3f9a21b7c4e
Create Date: 2026-08-19

Acrescenta ao diario de obra os campos usados no registro diario do canteiro
(clima, temperatura, efetivo, equipe, atividades, equipamentos, ocorrencias e
impedimentos) e permite vincular um documento a cada item do checklist da
prestacao de contas.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = 'f7a1c2d3e4b5'
down_revision: Union[str, Sequence[str], None] = ('a2b3c4d5e6f7', 'd3f9a21b7c4e')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('diario_obra', sa.Column('clima', sa.String(length=30), nullable=True))
    op.add_column('diario_obra', sa.Column('temperatura', sa.String(length=20), nullable=True))
    op.add_column('diario_obra', sa.Column('efetivo', sa.Integer(), nullable=True))
    op.add_column('diario_obra', sa.Column('equipe', sa.Text(), nullable=True))
    op.add_column('diario_obra', sa.Column('atividades', sa.Text(), nullable=True))
    op.add_column('diario_obra', sa.Column('equipamentos', sa.Text(), nullable=True))
    op.add_column('diario_obra', sa.Column('ocorrencias', sa.Text(), nullable=True))
    op.add_column('diario_obra', sa.Column('impedimentos', sa.Text(), nullable=True))

    op.add_column(
        'prestacoes_contas_itens',
        sa.Column('anexo_id', UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        'fk_prestacao_item_anexo',
        'prestacoes_contas_itens',
        'anexos',
        ['anexo_id'],
        ['id'],
        ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('fk_prestacao_item_anexo', 'prestacoes_contas_itens', type_='foreignkey')
    op.drop_column('prestacoes_contas_itens', 'anexo_id')

    for col in (
        'impedimentos', 'ocorrencias', 'equipamentos', 'atividades',
        'equipe', 'efetivo', 'temperatura', 'clima',
    ):
        op.drop_column('diario_obra', col)
