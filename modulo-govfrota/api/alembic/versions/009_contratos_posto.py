"""Contratos com postos credenciados: preço por litro e saldo em litros.

O motorista deixa de informar o valor pago no posto; o preço vem do contrato
vigente do posto para o combustível, e os litros saem do saldo contratado.

Revision ID: 009
Revises: 008
Create Date: 2026-09-29
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "009"
down_revision: Union[str, None] = "008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "contratos_posto",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("fornecedor_id", sa.Uuid(), nullable=False),
        sa.Column("combustivel_id", sa.Uuid(), nullable=False),
        sa.Column("numero", sa.String(50), nullable=True),
        sa.Column("preco_litro", sa.Numeric(12, 4), nullable=False),
        sa.Column("litros_contratados", sa.Numeric(14, 2), nullable=False),
        sa.Column("data_inicio", sa.Date(), nullable=True),
        sa.Column("data_fim", sa.Date(), nullable=True),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("observacoes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["fornecedor_id"], ["fornecedores.id"]),
        sa.ForeignKeyConstraint(["combustivel_id"], ["combustiveis.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_contratos_posto_organization_id", "contratos_posto", ["organization_id"])
    op.create_index(
        "ix_contratos_posto_org_fornecedor",
        "contratos_posto",
        ["organization_id", "fornecedor_id", "combustivel_id"],
    )

    op.add_column("abastecimentos", sa.Column("contrato_posto_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_abastecimentos_contrato_posto", "abastecimentos", "contratos_posto",
        ["contrato_posto_id"], ["id"],
    )
    op.create_index("ix_abastecimentos_contrato_posto_id", "abastecimentos", ["contrato_posto_id"])


def downgrade() -> None:
    op.drop_index("ix_abastecimentos_contrato_posto_id", table_name="abastecimentos")
    op.drop_constraint("fk_abastecimentos_contrato_posto", "abastecimentos", type_="foreignkey")
    op.drop_column("abastecimentos", "contrato_posto_id")
    op.drop_index("ix_contratos_posto_org_fornecedor", table_name="contratos_posto")
    op.drop_index("ix_contratos_posto_organization_id", table_name="contratos_posto")
    op.drop_table("contratos_posto")
