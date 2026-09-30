"""Notas fiscais por abastecimento, enviadas pelo portal do posto.

Revision ID: 016
Revises: 015
Create Date: 2026-09-29
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "016"
down_revision: Union[str, None] = "015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "abastecimento_notas",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("abastecimento_id", sa.Uuid(), sa.ForeignKey("abastecimentos.id", ondelete="CASCADE"), nullable=False),
        sa.Column("fornecedor_id", sa.Uuid(), sa.ForeignKey("fornecedores.id"), nullable=False),
        sa.Column("tipo", sa.String(20), nullable=False),
        sa.Column("anexo_id", sa.Uuid(), sa.ForeignKey("anexos.id"), nullable=False),
        sa.Column("nome_arquivo", sa.String(255), nullable=False),
        sa.Column("hash_sha256", sa.String(64), nullable=False),
        sa.Column("versao", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("desativado_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("enviado_por_acesso_fornecedor_id", sa.Uuid(), nullable=True),
        sa.Column("enviado_por_usuario_id", sa.Uuid(), nullable=True),
        sa.Column("nfe_chave", sa.String(44), nullable=True),
        sa.Column("nfe_numero", sa.String(20), nullable=True),
        sa.Column("nfe_serie", sa.String(5), nullable=True),
        sa.Column("nfe_emissao", sa.DateTime(timezone=True), nullable=True),
        sa.Column("nfe_emitente_cnpj", sa.String(14), nullable=True),
        sa.Column("nfe_valor_total", sa.Numeric(15, 2), nullable=True),
        sa.Column("avisos", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_abastecimento_notas_organization_id", "abastecimento_notas", ["organization_id"])
    op.create_index("ix_abastecimento_notas_abastecimento_id", "abastecimento_notas", ["abastecimento_id"])
    op.create_index("ix_abast_notas_org_criado", "abastecimento_notas", ["organization_id", "created_at"])
    op.create_index("ix_abast_notas_org_chave", "abastecimento_notas", ["organization_id", "nfe_chave"])


def downgrade() -> None:
    op.drop_table("abastecimento_notas")
