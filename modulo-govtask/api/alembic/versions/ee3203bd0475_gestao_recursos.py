"""gestao_recursos: diligencias, repasses, medicoes, contratos, licitacoes,
prestacoes, entregas, financeiro, auditoria, dependencias, favoritos

Revision ID: ee3203bd0475
Revises: 002
Create Date: 2026-08-19 11:17:59.938224
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'ee3203bd0475'
down_revision: Union[str, None] = '002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Auditoria ──────────────────────────────────────────
    op.create_table(
        'auditoria',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('organization_id', sa.UUID(), nullable=True),
        sa.Column('user_id', sa.UUID(), nullable=True),
        sa.Column('convenio_id', sa.UUID(), nullable=True),
        sa.Column('acao', sa.String(length=100), nullable=False),
        sa.Column('entidade', sa.String(length=100), nullable=True),
        sa.Column('entidade_id', sa.UUID(), nullable=True),
        sa.Column('dados_anteriores', sa.JSON(), nullable=True),
        sa.Column('dados_posteriores', sa.JSON(), nullable=True),
        sa.Column('ip', sa.String(length=45), nullable=True),
        sa.Column('user_agent', sa.String(length=255), nullable=True),
        sa.Column('ocorrido_em', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_auditoria_convenio_id', 'auditoria', ['convenio_id'])
    op.create_index('ix_auditoria_ocorrido_em', 'auditoria', ['ocorrido_em'])
    op.create_index('ix_auditoria_organization_id', 'auditoria', ['organization_id'])
    op.create_index('ix_auditoria_user_id', 'auditoria', ['user_id'])

    # ── Contratos + Aditivos ───────────────────────────────
    op.create_table(
        'contratos',
        sa.Column('convenio_id', sa.UUID(), nullable=False),
        sa.Column('numero', sa.String(length=100), nullable=True),
        sa.Column('fornecedor', sa.String(length=255), nullable=True),
        sa.Column('cnpj', sa.String(length=20), nullable=True),
        sa.Column('objeto', sa.Text(), nullable=True),
        sa.Column('valor', sa.Numeric(precision=15, scale=2), nullable=True),
        sa.Column('data_assinatura', sa.DateTime(timezone=True), nullable=True),
        sa.Column('vigencia_inicio', sa.DateTime(timezone=True), nullable=True),
        sa.Column('vigencia_fim', sa.DateTime(timezone=True), nullable=True),
        sa.Column('fiscal_id', sa.UUID(), nullable=True),
        sa.Column('gestor_id', sa.UUID(), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['convenio_id'], ['convenios.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['fiscal_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['gestor_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_contratos_convenio_id', 'contratos', ['convenio_id'])
    op.create_index('ix_contratos_numero', 'contratos', ['numero'])

    op.create_table(
        'aditivos',
        sa.Column('contrato_id', sa.UUID(), nullable=False),
        sa.Column('numero', sa.String(length=100), nullable=True),
        sa.Column('tipo', sa.String(length=20), nullable=False),
        sa.Column('motivo', sa.Text(), nullable=True),
        sa.Column('valor', sa.Numeric(precision=15, scale=2), nullable=True),
        sa.Column('prazo', sa.DateTime(timezone=True), nullable=True),
        sa.Column('data', sa.DateTime(timezone=True), nullable=True),
        sa.Column('aprovado_por_id', sa.UUID(), nullable=True),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['aprovado_por_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['contrato_id'], ['contratos.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_aditivos_contrato_id', 'aditivos', ['contrato_id'])

    # ── Diligências ────────────────────────────────────────
    op.create_table(
        'diligencias',
        sa.Column('convenio_id', sa.UUID(), nullable=False),
        sa.Column('origem', sa.String(length=30), nullable=False),
        sa.Column('origem_descricao', sa.String(length=255), nullable=True),
        sa.Column('data_recebimento', sa.DateTime(timezone=True), nullable=True),
        sa.Column('protocolo', sa.String(length=100), nullable=True),
        sa.Column('descricao', sa.Text(), nullable=False),
        sa.Column('prazo', sa.DateTime(timezone=True), nullable=True),
        sa.Column('responsavel_id', sa.UUID(), nullable=True),
        sa.Column('setor_destino_id', sa.UUID(), nullable=True),
        sa.Column('status', sa.String(length=30), nullable=False),
        sa.Column('tarefa_id', sa.UUID(), nullable=True),
        sa.Column('etapa_id', sa.UUID(), nullable=True),
        sa.Column('resposta_interna', sa.Text(), nullable=True),
        sa.Column('resposta_data', sa.DateTime(timezone=True), nullable=True),
        sa.Column('resposta_protocolo', sa.String(length=100), nullable=True),
        sa.Column('data_encerramento', sa.DateTime(timezone=True), nullable=True),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['convenio_id'], ['convenios.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['etapa_id'], ['etapas.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['responsavel_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['setor_destino_id'], ['setores.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['tarefa_id'], ['tarefas.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_diligencias_convenio_id', 'diligencias', ['convenio_id'])
    op.create_index('ix_diligencias_etapa_id', 'diligencias', ['etapa_id'])
    op.create_index('ix_diligencias_responsavel_id', 'diligencias', ['responsavel_id'])
    op.create_index('ix_diligencias_setor_destino_id', 'diligencias', ['setor_destino_id'])
    op.create_index('ix_diligencias_tarefa_id', 'diligencias', ['tarefa_id'])

    # ── Entregas de Objetos ────────────────────────────────
    op.create_table(
        'entregas_objetos',
        sa.Column('convenio_id', sa.UUID(), nullable=False),
        sa.Column('tipo', sa.String(length=20), nullable=False),
        sa.Column('fornecedor', sa.String(length=255), nullable=True),
        sa.Column('data_entrega', sa.DateTime(timezone=True), nullable=True),
        sa.Column('nota_fiscal', sa.String(length=50), nullable=True),
        sa.Column('quantidade', sa.Integer(), nullable=True),
        sa.Column('identificacao', sa.String(length=255), nullable=True),
        sa.Column('patrimonio', sa.String(length=100), nullable=True),
        sa.Column('placa', sa.String(length=20), nullable=True),
        sa.Column('chassi', sa.String(length=50), nullable=True),
        sa.Column('modelo', sa.String(length=100), nullable=True),
        sa.Column('local_entrega', sa.String(length=255), nullable=True),
        sa.Column('responsavel_recebimento_id', sa.UUID(), nullable=True),
        sa.Column('termo_recebimento', sa.Boolean(), nullable=False),
        sa.Column('observacao', sa.Text(), nullable=True),
        sa.Column('status', sa.String(length=30), nullable=False),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['convenio_id'], ['convenios.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['responsavel_recebimento_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_entregas_objetos_convenio_id', 'entregas_objetos', ['convenio_id'])

    # ── Licitações ─────────────────────────────────────────
    op.create_table(
        'licitacoes',
        sa.Column('convenio_id', sa.UUID(), nullable=False),
        sa.Column('numero', sa.String(length=100), nullable=True),
        sa.Column('modalidade', sa.String(length=100), nullable=True),
        sa.Column('objeto', sa.Text(), nullable=True),
        sa.Column('situacao', sa.String(length=30), nullable=False),
        sa.Column('valor_estimado', sa.Numeric(precision=15, scale=2), nullable=True),
        sa.Column('valor_contratado', sa.Numeric(precision=15, scale=2), nullable=True),
        sa.Column('vencedor', sa.String(length=255), nullable=True),
        sa.Column('cnpj_vencedor', sa.String(length=20), nullable=True),
        sa.Column('data_disputa', sa.DateTime(timezone=True), nullable=True),
        sa.Column('data_homologacao', sa.DateTime(timezone=True), nullable=True),
        sa.Column('observacao', sa.Text(), nullable=True),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['convenio_id'], ['convenios.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_licitacoes_convenio_id', 'licitacoes', ['convenio_id'])
    op.create_index('ix_licitacoes_numero', 'licitacoes', ['numero'])

    # ── Medições ───────────────────────────────────────────
    op.create_table(
        'medicoes',
        sa.Column('convenio_id', sa.UUID(), nullable=False),
        sa.Column('numero', sa.Integer(), nullable=False),
        sa.Column('periodo_inicio', sa.DateTime(timezone=True), nullable=True),
        sa.Column('periodo_fim', sa.DateTime(timezone=True), nullable=True),
        sa.Column('data', sa.DateTime(timezone=True), nullable=True),
        sa.Column('valor', sa.Numeric(precision=15, scale=2), nullable=True),
        sa.Column('percentual', sa.Numeric(precision=5, scale=2), nullable=True),
        sa.Column('percentual_acumulado', sa.Numeric(precision=5, scale=2), nullable=True),
        sa.Column('responsavel_id', sa.UUID(), nullable=True),
        sa.Column('observacao', sa.Text(), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('aprovada_por_id', sa.UUID(), nullable=True),
        sa.Column('data_aprovacao', sa.DateTime(timezone=True), nullable=True),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['aprovada_por_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['convenio_id'], ['convenios.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['responsavel_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_medicoes_convenio_id', 'medicoes', ['convenio_id'])

    # ── Movimentos Financeiros ─────────────────────────────
    op.create_table(
        'movimentos_financeiros',
        sa.Column('convenio_id', sa.UUID(), nullable=False),
        sa.Column('tipo', sa.String(length=30), nullable=False),
        sa.Column('numero', sa.String(length=100), nullable=True),
        sa.Column('data', sa.DateTime(timezone=True), nullable=True),
        sa.Column('valor', sa.Numeric(precision=15, scale=2), nullable=True),
        sa.Column('favorecido', sa.String(length=255), nullable=True),
        sa.Column('descricao', sa.Text(), nullable=True),
        sa.Column('medicao_id', sa.UUID(), nullable=True),
        sa.Column('contrato_id', sa.UUID(), nullable=True),
        sa.Column('registro_por_id', sa.UUID(), nullable=False),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['contrato_id'], ['contratos.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['convenio_id'], ['convenios.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['medicao_id'], ['medicoes.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['registro_por_id'], ['users.id'], ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_movimentos_financeiros_contrato_id', 'movimentos_financeiros', ['contrato_id'])
    op.create_index('ix_movimentos_financeiros_convenio_id', 'movimentos_financeiros', ['convenio_id'])
    op.create_index('ix_movimentos_financeiros_medicao_id', 'movimentos_financeiros', ['medicao_id'])

    # ── Prestações de Contas ───────────────────────────────
    op.create_table(
        'prestacoes_contas',
        sa.Column('convenio_id', sa.UUID(), nullable=False),
        sa.Column('titulo', sa.String(length=300), nullable=True),
        sa.Column('status', sa.String(length=30), nullable=False),
        sa.Column('responsavel_id', sa.UUID(), nullable=True),
        sa.Column('data_envio', sa.DateTime(timezone=True), nullable=True),
        sa.Column('sistema_envio', sa.String(length=100), nullable=True),
        sa.Column('protocolo', sa.String(length=100), nullable=True),
        sa.Column('observacao', sa.Text(), nullable=True),
        sa.Column('parecer', sa.Text(), nullable=True),
        sa.Column('data_aprovacao', sa.DateTime(timezone=True), nullable=True),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['convenio_id'], ['convenios.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['responsavel_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_prestacoes_contas_convenio_id', 'prestacoes_contas', ['convenio_id'])

    op.create_table(
        'prestacoes_contas_itens',
        sa.Column('prestacao_id', sa.UUID(), nullable=False),
        sa.Column('descricao', sa.String(length=300), nullable=False),
        sa.Column('conferido', sa.Boolean(), nullable=False),
        sa.Column('conferido_por_id', sa.UUID(), nullable=True),
        sa.Column('data_conferencia', sa.DateTime(timezone=True), nullable=True),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['conferido_por_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['prestacao_id'], ['prestacoes_contas.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_prestacoes_contas_itens_prestacao_id', 'prestacoes_contas_itens', ['prestacao_id'])

    # ── Processos Favoritos ────────────────────────────────
    op.create_table(
        'processos_favoritos',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('convenio_id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['convenio_id'], ['convenios.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_processos_favoritos_convenio_id', 'processos_favoritos', ['convenio_id'])
    op.create_index('ix_processos_favoritos_user_id', 'processos_favoritos', ['user_id'])

    # ── Repasses ───────────────────────────────────────────
    op.create_table(
        'repasses',
        sa.Column('convenio_id', sa.UUID(), nullable=False),
        sa.Column('parcela', sa.Integer(), nullable=False),
        sa.Column('valor_previsto', sa.Numeric(precision=15, scale=2), nullable=True),
        sa.Column('valor_recebido', sa.Numeric(precision=15, scale=2), nullable=True),
        sa.Column('data_prevista', sa.DateTime(timezone=True), nullable=True),
        sa.Column('data_recebida', sa.DateTime(timezone=True), nullable=True),
        sa.Column('conta_destino', sa.String(length=100), nullable=True),
        sa.Column('observacao', sa.Text(), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('registrado_por_id', sa.UUID(), nullable=False),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['convenio_id'], ['convenios.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['registrado_por_id'], ['users.id'], ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_repasses_convenio_id', 'repasses', ['convenio_id'])

    # ── Dependências de Tarefa ─────────────────────────────
    op.create_table(
        'tarefas_dependencias',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('tarefa_id', sa.UUID(), nullable=False),
        sa.Column('depende_de_id', sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(['depende_de_id'], ['tarefas.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['tarefa_id'], ['tarefas.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('tarefa_id', 'depende_de_id', name='uq_tarefa_dependencia'),
    )
    op.create_index('ix_tarefas_dependencias_tarefa_id', 'tarefas_dependencias', ['tarefa_id'])

    # ── Extensões em anexos ────────────────────────────────
    op.add_column('anexos', sa.Column('medicao_id', sa.UUID(), nullable=True))
    op.add_column('anexos', sa.Column('prestacao_id', sa.UUID(), nullable=True))
    op.add_column('anexos', sa.Column('diligencia_id', sa.UUID(), nullable=True))
    op.add_column('anexos', sa.Column('entrega_id', sa.UUID(), nullable=True))
    op.add_column(
        'anexos',
        sa.Column('categoria', sa.String(length=30), nullable=False, server_default='OUTROS'),
    )
    op.add_column(
        'anexos',
        sa.Column('classificacao', sa.String(length=20), nullable=False, server_default='INTERNO'),
    )
    op.add_column('anexos', sa.Column('descricao', sa.Text(), nullable=True))
    op.add_column('anexos', sa.Column('motivo_versao', sa.String(length=500), nullable=True))
    op.add_column(
        'anexos',
        sa.Column('enviado_externo', sa.Boolean(), nullable=False, server_default=sa.text('false')),
    )
    op.add_column('anexos', sa.Column('enviado_externo_data', sa.DateTime(timezone=True), nullable=True))
    op.add_column('anexos', sa.Column('enviado_externo_sistema', sa.String(length=100), nullable=True))
    op.add_column('anexos', sa.Column('enviado_externo_protocolo', sa.String(length=100), nullable=True))
    op.add_column('anexos', sa.Column('enviado_externo_observacao', sa.Text(), nullable=True))

    op.create_index('ix_anexos_diligencia_id', 'anexos', ['diligencia_id'])
    op.create_index('ix_anexos_entrega_id', 'anexos', ['entrega_id'])
    op.create_index('ix_anexos_medicao_id', 'anexos', ['medicao_id'])
    op.create_index('ix_anexos_prestacao_id', 'anexos', ['prestacao_id'])

    op.create_foreign_key(
        None, 'anexos', 'diligencias', ['diligencia_id'], ['id'], ondelete='SET NULL'
    )
    op.create_foreign_key(
        None, 'anexos', 'entregas_objetos', ['entrega_id'], ['id'], ondelete='SET NULL'
    )
    op.create_foreign_key(
        None, 'anexos', 'prestacoes_contas', ['prestacao_id'], ['id'], ondelete='SET NULL'
    )
    op.create_foreign_key(
        None, 'anexos', 'medicoes', ['medicao_id'], ['id'], ondelete='SET NULL'
    )

    # Remove o server_default temporário das colunas NOT NULL novas após o backfill.
    op.alter_column('anexos', 'categoria', server_default=None)
    op.alter_column('anexos', 'classificacao', server_default=None)
    op.alter_column('anexos', 'enviado_externo', server_default=None)


def downgrade() -> None:
    op.drop_table('tarefas_dependencias')
    op.drop_table('repasses')
    op.drop_table('processos_favoritos')
    op.drop_table('prestacoes_contas_itens')
    op.drop_table('prestacoes_contas')
    op.drop_table('movimentos_financeiros')
    op.drop_table('medicoes')
    op.drop_table('licitacoes')
    op.drop_table('entregas_objetos')
    op.drop_table('diligencias')
    op.drop_table('aditivos')
    op.drop_table('contratos')
    op.drop_table('auditoria')

    op.drop_constraint('anexos_medicoes_fkey', 'anexos', type_='foreignkey')
    op.drop_constraint('anexos_prestacoes_contas_fkey', 'anexos', type_='foreignkey')
    op.drop_constraint('anexos_entregas_objetos_fkey', 'anexos', type_='foreignkey')
    op.drop_constraint('anexos_diligencias_fkey', 'anexos', type_='foreignkey')
    op.drop_index('ix_anexos_prestacao_id', table_name='anexos')
    op.drop_index('ix_anexos_medicao_id', table_name='anexos')
    op.drop_index('ix_anexos_entrega_id', table_name='anexos')
    op.drop_index('ix_anexos_diligencia_id', table_name='anexos')
    op.drop_column('anexos', 'enviado_externo_observacao')
    op.drop_column('anexos', 'enviado_externo_protocolo')
    op.drop_column('anexos', 'enviado_externo_sistema')
    op.drop_column('anexos', 'enviado_externo_data')
    op.drop_column('anexos', 'enviado_externo')
    op.drop_column('anexos', 'motivo_versao')
    op.drop_column('anexos', 'descricao')
    op.drop_column('anexos', 'classificacao')
    op.drop_column('anexos', 'categoria')
    op.drop_column('anexos', 'entrega_id')
    op.drop_column('anexos', 'diligencia_id')
    op.drop_column('anexos', 'prestacao_id')
    op.drop_column('anexos', 'medicao_id')
