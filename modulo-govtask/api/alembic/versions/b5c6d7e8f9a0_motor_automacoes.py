"""Motor de automações auditável e idempotente.

Revision ID: b5c6d7e8f9a0
Revises: a4b5c6d7e8f9
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "b5c6d7e8f9a0"
down_revision: Union[str, Sequence[str], None] = "a4b5c6d7e8f9"
branch_labels = None
depends_on = None
UUID = postgresql.UUID(as_uuid=True)

def upgrade() -> None:
    op.create_table(
        "automacoes",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("organization_id", UUID, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("nome", sa.String(160), nullable=False),
        sa.Column("descricao", sa.Text(), nullable=True),
        sa.Column("gatilho", sa.String(60), nullable=False),
        sa.Column("condicao", sa.JSON(), nullable=True),
        sa.Column("acoes", sa.JSON(), nullable=False),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("criado_por_id", UUID, sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_automacoes_organization_id", "automacoes", ["organization_id"])
    op.create_index("ix_automacoes_gatilho", "automacoes", ["gatilho"])
    op.create_index("ix_automacoes_ativo", "automacoes", ["ativo"])
    op.create_table(
        "automacao_execucoes",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("automacao_id", UUID, sa.ForeignKey("automacoes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("evento_id", UUID, sa.ForeignKey("eventos_timeline.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sucesso", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("resultado", sa.JSON(), nullable=True),
        sa.Column("erro", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("automacao_id", "evento_id", name="uq_automacao_evento"),
    )
    op.create_index("ix_automacao_execucoes_automacao_id", "automacao_execucoes", ["automacao_id"])
    op.create_index("ix_automacao_execucoes_evento_id", "automacao_execucoes", ["evento_id"])

def downgrade() -> None:
    op.drop_table("automacao_execucoes")
    op.drop_table("automacoes")
