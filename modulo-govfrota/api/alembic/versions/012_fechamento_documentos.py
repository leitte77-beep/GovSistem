"""Documentos do fechamento (XML da NF-e, DANFE, complementares).

Revision ID: 012
Revises: 011
Create Date: 2026-09-29
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "012"
down_revision: Union[str, None] = "011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "fechamento_documentos",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("fechamento_id", sa.Uuid(), nullable=False),
        sa.Column("tipo", sa.String(20), nullable=False),
        sa.Column("anexo_id", sa.Uuid(), nullable=False),
        sa.Column("nome_arquivo", sa.String(255), nullable=False),
        sa.Column("hash_sha256", sa.String(64), nullable=False),
        sa.Column("versao", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("observacao", sa.Text(), nullable=True),
        sa.Column("enviado_por_usuario_id", sa.Uuid(), nullable=True),
        sa.Column("desativado_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("motivo_desativacao", sa.Text(), nullable=True),
        sa.Column("nfe_chave", sa.String(44), nullable=True),
        sa.Column("nfe_numero", sa.String(20), nullable=True),
        sa.Column("nfe_serie", sa.String(5), nullable=True),
        sa.Column("nfe_emissao", sa.DateTime(timezone=True), nullable=True),
        sa.Column("nfe_emitente_cnpj", sa.String(14), nullable=True),
        sa.Column("nfe_valor_total", sa.Numeric(15, 2), nullable=True),
        sa.Column("nfe_dados", sa.Text(), nullable=True),
        sa.Column("avisos", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["fechamento_id"], ["fechamentos.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["anexo_id"], ["anexos.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_fechamento_documentos_organization_id", "fechamento_documentos", ["organization_id"])
    op.create_index("ix_fechamento_documentos_fechamento_id", "fechamento_documentos", ["fechamento_id"])
    op.create_index("ix_fech_docs_org_chave", "fechamento_documentos", ["organization_id", "nfe_chave"])


def downgrade() -> None:
    op.drop_table("fechamento_documentos")
