"""modulo_obras: obras, cronograma fisico-financeiro, diario de obra e registro fotografico

Revision ID: c3412d479b8a
Revises: abab9663d126
Create Date: 2026-08-19
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'c3412d479b8a'
down_revision: Union[str, None] = 'abab9663d126'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'obras',
        sa.Column('convenio_id', sa.UUID(), nullable=False),
        sa.Column('nome', sa.String(length=300), nullable=True),
        sa.Column('endereco', sa.String(length=500), nullable=True),
        sa.Column('coordenadas', sa.String(length=100), nullable=True),
        sa.Column('objeto', sa.Text(), nullable=True),
        sa.Column('empresa', sa.String(length=255), nullable=True),
        sa.Column('cnpj_empresa', sa.String(length=20), nullable=True),
        sa.Column('contrato_numero', sa.String(length=100), nullable=True),
        sa.Column('responsavel_tecnico', sa.String(length=255), nullable=True),
        sa.Column('fiscal_id', sa.UUID(), nullable=True),
        sa.Column('gestor_id', sa.UUID(), nullable=True),
        sa.Column('data_inicio', sa.DateTime(timezone=True), nullable=True),
        sa.Column('previsao_conclusao', sa.DateTime(timezone=True), nullable=True),
        sa.Column('valor_contrato', sa.Numeric(precision=15, scale=2), nullable=True),
        sa.Column('situacao', sa.String(length=40), nullable=True),
        sa.Column('percentual_fisico', sa.Numeric(precision=5, scale=2), nullable=True),
        sa.Column('percentual_financeiro', sa.Numeric(precision=5, scale=2), nullable=True),
        sa.Column('observacoes', sa.Text(), nullable=True),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['convenio_id'], ['convenios.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['fiscal_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['gestor_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_obras_convenio_id', 'obras', ['convenio_id'])
    op.create_index('ix_obras_situacao', 'obras', ['situacao'])

    op.create_table(
        'cronogramas_fisico_financeiro',
        sa.Column('obra_id', sa.UUID(), nullable=False),
        sa.Column('descricao', sa.String(length=300), nullable=False),
        sa.Column('valor', sa.Numeric(precision=15, scale=2), nullable=True),
        sa.Column('percentual_previsto', sa.Numeric(precision=5, scale=2), nullable=True),
        sa.Column('percentual_realizado', sa.Numeric(precision=5, scale=2), nullable=True),
        sa.Column('data_inicio_prevista', sa.DateTime(timezone=True), nullable=True),
        sa.Column('data_fim_prevista', sa.DateTime(timezone=True), nullable=True),
        sa.Column('ordem', sa.Integer(), nullable=False),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['obra_id'], ['obras.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_cronogramas_fisico_financeiro_obra_id', 'cronogramas_fisico_financeiro', ['obra_id'])

    op.create_table(
        'diario_obra',
        sa.Column('obra_id', sa.UUID(), nullable=False),
        sa.Column('tipo', sa.String(length=40), nullable=False),
        sa.Column('data', sa.DateTime(timezone=True), nullable=True),
        sa.Column('titulo', sa.String(length=300), nullable=True),
        sa.Column('descricao', sa.Text(), nullable=True),
        sa.Column('registrado_por_id', sa.UUID(), nullable=True),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['obra_id'], ['obras.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['registrado_por_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_diario_obra_obra_id', 'diario_obra', ['obra_id'])

    op.create_table(
        'registros_fotograficos',
        sa.Column('obra_id', sa.UUID(), nullable=False),
        sa.Column('data', sa.DateTime(timezone=True), nullable=True),
        sa.Column('observacao', sa.Text(), nullable=True),
        sa.Column('etapa', sa.String(length=100), nullable=True),
        sa.Column('medicao_id', sa.UUID(), nullable=True),
        sa.Column('latitude', sa.String(length=30), nullable=True),
        sa.Column('longitude', sa.String(length=30), nullable=True),
        sa.Column('anexo_id', sa.UUID(), nullable=True),
        sa.Column('registrado_por_id', sa.UUID(), nullable=True),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['anexo_id'], ['anexos.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['medicao_id'], ['medicoes.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['obra_id'], ['obras.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['registrado_por_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_registros_fotograficos_obra_id', 'registros_fotograficos', ['obra_id'])


def downgrade() -> None:
    op.drop_table('registros_fotograficos')
    op.drop_table('diario_obra')
    op.drop_table('cronogramas_fisico_financeiro')
    op.drop_table('obras')
