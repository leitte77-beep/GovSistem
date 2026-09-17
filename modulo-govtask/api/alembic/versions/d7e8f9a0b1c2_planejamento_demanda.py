"""Modelos, recorrências e substituições de demanda.

Revision ID: d7e8f9a0b1c2
Revises: c6d7e8f9a0b1
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "d7e8f9a0b1c2"
down_revision = "c6d7e8f9a0b1"
branch_labels = None
depends_on = None
UUID = postgresql.UUID(as_uuid=True)

def upgrade():
    op.create_table("modelos_demanda", sa.Column("id", UUID, primary_key=True), sa.Column("organization_id", UUID, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False), sa.Column("nome", sa.String(160), nullable=False), sa.Column("descricao", sa.Text()), sa.Column("configuracao", sa.JSON(), nullable=False), sa.Column("ativo", sa.Boolean(), nullable=False, server_default=sa.true()), sa.Column("criado_por_id", UUID, sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False), sa.Column("deleted_at", sa.DateTime(timezone=True)), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False), sa.UniqueConstraint("organization_id", "nome", name="uq_modelo_demanda_org_nome"))
    op.create_index("ix_modelos_demanda_organization_id", "modelos_demanda", ["organization_id"]); op.create_index("ix_modelos_demanda_ativo", "modelos_demanda", ["ativo"])
    op.create_table("recorrencias_demanda", sa.Column("id", UUID, primary_key=True), sa.Column("organization_id", UUID, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False), sa.Column("modelo_id", UUID, sa.ForeignKey("modelos_demanda.id", ondelete="RESTRICT"), nullable=False), sa.Column("periodicidade", sa.String(15), nullable=False), sa.Column("proxima_execucao", sa.Date(), nullable=False), sa.Column("ativa", sa.Boolean(), nullable=False, server_default=sa.true()), sa.Column("criada_por_id", UUID, sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False), sa.Column("ultima_demanda_id", UUID, sa.ForeignKey("demandas.id", ondelete="SET NULL")), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False))
    for col in ("organization_id", "modelo_id", "proxima_execucao", "ativa"): op.create_index(f"ix_recorrencias_demanda_{col}", "recorrencias_demanda", [col])
    op.create_table("ausencias_substituicoes", sa.Column("id", UUID, primary_key=True), sa.Column("organization_id", UUID, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False), sa.Column("titular_id", UUID, sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False), sa.Column("substituto_id", UUID, sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False), sa.Column("inicio", sa.Date(), nullable=False), sa.Column("fim", sa.Date(), nullable=False), sa.Column("motivo", sa.String(20), nullable=False), sa.Column("observacao", sa.Text()), sa.Column("criado_por_id", UUID, sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False), sa.Column("deleted_at", sa.DateTime(timezone=True)), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False))
    for col in ("organization_id", "titular_id", "substituto_id", "inicio", "fim"): op.create_index(f"ix_ausencias_substituicoes_{col}", "ausencias_substituicoes", [col])

def downgrade():
    op.drop_table("ausencias_substituicoes"); op.drop_table("recorrencias_demanda"); op.drop_table("modelos_demanda")
