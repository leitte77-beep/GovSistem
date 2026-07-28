"""Create estoque tables: insumos, locais_estoque, estoque_saldos, movimentacoes_estoque, movimentacao_itens (Fase 3.11)

Revision ID: 028
Revises: 027
Create Date: 2026-07-14
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "028"
down_revision: Union[str, None] = "027"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table("insumos",
        sa.Column("id", sa.UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", sa.String(36), nullable=False, index=True),
        sa.Column("descricao", sa.String(150), nullable=False),
        sa.Column("grupo_insumo_id", sa.UUID(), nullable=True),
        sa.Column("unidade_medida_id", sa.UUID(), nullable=True),
        sa.Column("fabricante", sa.String(100), nullable=True),
        sa.Column("controla_lote", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("controla_validade", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_table("locais_estoque",
        sa.Column("id", sa.UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", sa.String(36), nullable=False, index=True),
        sa.Column("unit_id", sa.UUID(), sa.ForeignKey("units.id", ondelete="CASCADE"), nullable=False),
        sa.Column("descricao", sa.String(100), nullable=False),
        sa.Column("aceita_requisicao", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("mostra_saldo_requisicao", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_table("estoque_saldos",
        sa.Column("id", sa.UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", sa.String(36), nullable=False, index=True),
        sa.Column("local_id", sa.UUID(), sa.ForeignKey("locais_estoque.id", ondelete="CASCADE"), nullable=False),
        sa.Column("insumo_id", sa.UUID(), sa.ForeignKey("insumos.id", ondelete="CASCADE"), nullable=False),
        sa.Column("quantidade", sa.Numeric(12, 3), nullable=False, server_default="0"),
        sa.Column("quantidade_minima", sa.Numeric(12, 3), nullable=False, server_default="0"),
        sa.Column("valor_unitario", sa.Numeric(12, 2), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_table("movimentacoes_estoque",
        sa.Column("id", sa.UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", sa.String(36), nullable=False, index=True),
        sa.Column("tipo", sa.String(20), nullable=False),
        sa.Column("local_origem_id", sa.UUID(), sa.ForeignKey("locais_estoque.id", ondelete="SET NULL"), nullable=True),
        sa.Column("local_destino_id", sa.UUID(), sa.ForeignKey("locais_estoque.id", ondelete="SET NULL"), nullable=True),
        sa.Column("fornecedor_id", sa.UUID(), nullable=True),
        sa.Column("data_movimentacao", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="CONCLUIDA"),
        sa.Column("observacao", sa.Text(), nullable=True),
        sa.Column("registrado_por_id", sa.UUID(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_table("movimentacao_itens",
        sa.Column("id", sa.UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("movimentacao_id", sa.UUID(), sa.ForeignKey("movimentacoes_estoque.id", ondelete="CASCADE"), nullable=False),
        sa.Column("insumo_id", sa.UUID(), sa.ForeignKey("insumos.id", ondelete="CASCADE"), nullable=False),
        sa.Column("lote", sa.String(50), nullable=True),
        sa.Column("data_validade", sa.DateTime(), nullable=True),
        sa.Column("quantidade", sa.Numeric(12, 3), nullable=False),
        sa.Column("valor_unitario", sa.Numeric(12, 2), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )


def downgrade() -> None:
    op.drop_table("movimentacao_itens")
    op.drop_table("movimentacoes_estoque")
    op.drop_table("estoque_saldos")
    op.drop_table("locais_estoque")
    op.drop_table("insumos")
