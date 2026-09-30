"""Conciliações da NF-e com os abastecimentos do fechamento.

Revision ID: 013
Revises: 012
Create Date: 2026-09-29
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "013"
down_revision: Union[str, None] = "012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "fechamento_conciliacoes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("fechamento_id", sa.Uuid(), nullable=False),
        sa.Column("documento_id", sa.Uuid(), nullable=False),
        sa.Column("resultado", sa.String(30), nullable=False),
        sa.Column("dados", sa.Text(), nullable=False),
        sa.Column("mapeamento_manual", sa.Text(), nullable=True),
        sa.Column("executado_por_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["fechamento_id"], ["fechamentos.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["documento_id"], ["fechamento_documentos.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_fechamento_conciliacoes_organization_id", "fechamento_conciliacoes", ["organization_id"])
    op.create_index("ix_fechamento_conciliacoes_fechamento_id", "fechamento_conciliacoes", ["fechamento_id"])


def downgrade() -> None:
    op.drop_table("fechamento_conciliacoes")
