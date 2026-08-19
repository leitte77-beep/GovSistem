"""cadastro_rico_processo: campos ampliados do processo (convenios)

Revision ID: abab9663d126
Revises: ee3203bd0475
Create Date: 2026-08-19
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'abab9663d126'
down_revision: Union[str, None] = 'ee3203bd0475'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('convenios', sa.Column('categoria', sa.String(length=40), nullable=True))
    op.add_column('convenios', sa.Column('esfera', sa.String(length=20), nullable=True))
    op.add_column('convenios', sa.Column('prioridade', sa.String(length=10), nullable=True))
    op.add_column('convenios', sa.Column('situacao', sa.String(length=40), nullable=True))
    op.add_column('convenios', sa.Column('parlamentar', sa.String(length=255), nullable=True))
    op.add_column('convenios', sa.Column('parlamentar_cargo', sa.String(length=100), nullable=True))
    op.add_column('convenios', sa.Column('partido', sa.String(length=100), nullable=True))
    op.add_column('convenios', sa.Column('orgao_concedente', sa.String(length=255), nullable=True))
    op.add_column('convenios', sa.Column('programa', sa.String(length=255), nullable=True))
    op.add_column('convenios', sa.Column('finalidade', sa.Text(), nullable=True))
    op.add_column('convenios', sa.Column('numero_proposta', sa.String(length=100), nullable=True))
    op.add_column('convenios', sa.Column('numero_instrumento', sa.String(length=100), nullable=True))
    op.add_column('convenios', sa.Column('numero_convenio', sa.String(length=100), nullable=True))
    op.add_column('convenios', sa.Column('numero_contrato_repasse', sa.String(length=100), nullable=True))
    op.add_column('convenios', sa.Column('numero_emenda', sa.String(length=100), nullable=True))
    op.add_column('convenios', sa.Column('numero_plano_acao', sa.String(length=100), nullable=True))
    op.add_column('convenios', sa.Column('numero_plano_trabalho', sa.String(length=100), nullable=True))
    op.add_column('convenios', sa.Column('valor_solicitado', sa.Numeric(precision=15, scale=2), nullable=True))
    op.add_column('convenios', sa.Column('valor_aprovado', sa.Numeric(precision=15, scale=2), nullable=True))
    op.add_column('convenios', sa.Column('valor_repasse', sa.Numeric(precision=15, scale=2), nullable=True))
    op.add_column('convenios', sa.Column('contrapartida', sa.Numeric(precision=15, scale=2), nullable=True))
    op.add_column('convenios', sa.Column('valor_executado', sa.Numeric(precision=15, scale=2), nullable=True))
    op.add_column('convenios', sa.Column('valor_pago', sa.Numeric(precision=15, scale=2), nullable=True))
    op.add_column('convenios', sa.Column('saldo', sa.Numeric(precision=15, scale=2), nullable=True))
    op.add_column('convenios', sa.Column('data_aprovacao', sa.DateTime(timezone=True), nullable=True))
    op.add_column('convenios', sa.Column('data_assinatura', sa.DateTime(timezone=True), nullable=True))
    op.add_column('convenios', sa.Column('vigencia_inicio', sa.DateTime(timezone=True), nullable=True))
    op.add_column('convenios', sa.Column('vigencia_fim', sa.DateTime(timezone=True), nullable=True))
    op.add_column('convenios', sa.Column('prazo_execucao', sa.DateTime(timezone=True), nullable=True))
    op.add_column('convenios', sa.Column('prazo_prestacao_contas', sa.DateTime(timezone=True), nullable=True))
    op.add_column('convenios', sa.Column('previsao_conclusao', sa.DateTime(timezone=True), nullable=True))
    op.add_column('convenios', sa.Column('conclusao_efetiva', sa.DateTime(timezone=True), nullable=True))
    op.add_column('convenios', sa.Column('gestor_id', sa.UUID(), nullable=True))
    op.add_column('convenios', sa.Column('fiscal_id', sa.UUID(), nullable=True))
    op.add_column('convenios', sa.Column('engenheiro_id', sa.UUID(), nullable=True))
    op.add_column('convenios', sa.Column('links_externos', sa.JSON(), nullable=True))
    op.add_column('convenios', sa.Column('identificadores_externos', sa.JSON(), nullable=True))

    op.create_index('ix_convenios_categoria', 'convenios', ['categoria'])
    op.create_index('ix_convenios_esfera', 'convenios', ['esfera'])
    op.create_index('ix_convenios_situacao', 'convenios', ['situacao'])
    op.create_index('ix_convenios_numero_convenio', 'convenios', ['numero_convenio'])
    op.create_foreign_key(None, 'convenios', 'users', ['engenheiro_id'], ['id'], ondelete='SET NULL')
    op.create_foreign_key(None, 'convenios', 'users', ['gestor_id'], ['id'], ondelete='SET NULL')
    op.create_foreign_key(None, 'convenios', 'users', ['fiscal_id'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    op.drop_constraint('convenios_engenheiro_id_fkey', 'convenios', type_='foreignkey')
    op.drop_constraint('convenios_gestor_id_fkey', 'convenios', type_='foreignkey')
    op.drop_constraint('convenios_fiscal_id_fkey', 'convenios', type_='foreignkey')
    op.drop_index('ix_convenios_numero_convenio', table_name='convenios')
    op.drop_index('ix_convenios_situacao', table_name='convenios')
    op.drop_index('ix_convenios_esfera', table_name='convenios')
    op.drop_index('ix_convenios_categoria', table_name='convenios')
    op.drop_column('convenios', 'identificadores_externos')
    op.drop_column('convenios', 'links_externos')
    op.drop_column('convenios', 'engenheiro_id')
    op.drop_column('convenios', 'fiscal_id')
    op.drop_column('convenios', 'gestor_id')
    op.drop_column('convenios', 'conclusao_efetiva')
    op.drop_column('convenios', 'previsao_conclusao')
    op.drop_column('convenios', 'prazo_prestacao_contas')
    op.drop_column('convenios', 'prazo_execucao')
    op.drop_column('convenios', 'vigencia_fim')
    op.drop_column('convenios', 'vigencia_inicio')
    op.drop_column('convenios', 'data_assinatura')
    op.drop_column('convenios', 'data_aprovacao')
    op.drop_column('convenios', 'saldo')
    op.drop_column('convenios', 'valor_pago')
    op.drop_column('convenios', 'valor_executado')
    op.drop_column('convenios', 'contrapartida')
    op.drop_column('convenios', 'valor_repasse')
    op.drop_column('convenios', 'valor_aprovado')
    op.drop_column('convenios', 'valor_solicitado')
    op.drop_column('convenios', 'numero_plano_trabalho')
    op.drop_column('convenios', 'numero_plano_acao')
    op.drop_column('convenios', 'numero_emenda')
    op.drop_column('convenios', 'numero_contrato_repasse')
    op.drop_column('convenios', 'numero_convenio')
    op.drop_column('convenios', 'numero_instrumento')
    op.drop_column('convenios', 'numero_proposta')
    op.drop_column('convenios', 'finalidade')
    op.drop_column('convenios', 'programa')
    op.drop_column('convenios', 'orgao_concedente')
    op.drop_column('convenios', 'partido')
    op.drop_column('convenios', 'parlamentar_cargo')
    op.drop_column('convenios', 'parlamentar')
    op.drop_column('convenios', 'situacao')
    op.drop_column('convenios', 'prioridade')
    op.drop_column('convenios', 'esfera')
    op.drop_column('convenios', 'categoria')
