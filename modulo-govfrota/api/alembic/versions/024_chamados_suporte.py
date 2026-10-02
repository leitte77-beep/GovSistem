"""Chamados de suporte abertos pelo posto no portal do fornecedor.

Revision ID: 024
Revises: 023
Create Date: 2026-10-01
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "024"
down_revision: Union[str, None] = "023"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "chamados_suporte",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("fornecedor_id", UUID(as_uuid=True), sa.ForeignKey("fornecedores.id"), nullable=True),
        sa.Column("acesso_fornecedor_id", UUID(as_uuid=True), sa.ForeignKey("acessos_fornecedor.id", ondelete="SET NULL"), nullable=True),
        sa.Column("numero", sa.Integer(), nullable=False),
        sa.Column("tipo", sa.String(20), nullable=False),
        sa.Column("assunto", sa.String(150), nullable=False),
        sa.Column("descricao", sa.Text(), nullable=False),
        sa.Column("abastecimento_id", UUID(as_uuid=True), sa.ForeignKey("abastecimentos.id", ondelete="SET NULL"), nullable=True),
        sa.Column("aberto_por", sa.String(150), nullable=False),
        sa.Column("contato", sa.String(150), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="ABERTO"),
        sa.Column("resposta", sa.Text(), nullable=True),
        sa.Column("respondido_por", sa.String(150), nullable=True),
        sa.Column("respondido_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_chamados_suporte_organization_id", "chamados_suporte", ["organization_id"])
    op.create_index("ix_chamados_suporte_fornecedor_id", "chamados_suporte", ["fornecedor_id"])
    op.create_index("ix_chamados_org_numero", "chamados_suporte", ["organization_id", "numero"], unique=True)


def downgrade() -> None:
    op.drop_table("chamados_suporte")
