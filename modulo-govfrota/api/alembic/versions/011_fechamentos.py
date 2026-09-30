"""Fechamentos (faturamento) com postos, por secretaria.

Revision ID: 011
Revises: 010
Create Date: 2026-09-29
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "011"
down_revision: Union[str, None] = "010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _ts():
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    ]


def upgrade() -> None:
    op.create_table(
        "fechamentos",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("codigo", sa.String(20), nullable=False),
        sa.Column("fornecedor_id", sa.Uuid(), nullable=False),
        sa.Column("unidade_id", sa.Uuid(), nullable=False),
        sa.Column("contrato_posto_id", sa.Uuid(), nullable=True),
        sa.Column("periodo_inicio", sa.Date(), nullable=False),
        sa.Column("periodo_fim", sa.Date(), nullable=False),
        sa.Column("status", sa.String(30), nullable=False, server_default="ABERTO"),
        sa.Column("quantidade_abastecimentos", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_litros", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("total_valor", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("empenho_numero", sa.String(50), nullable=True),
        sa.Column("empenho_exercicio", sa.Integer(), nullable=True),
        sa.Column("observacoes", sa.Text(), nullable=True),
        sa.Column("criado_por_id", sa.Uuid(), nullable=True),
        sa.Column("confirmado_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("confirmado_por_id", sa.Uuid(), nullable=True),
        sa.Column("cancelado_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelado_por_id", sa.Uuid(), nullable=True),
        sa.Column("motivo_cancelamento", sa.Text(), nullable=True),
        *_ts(),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["fornecedor_id"], ["fornecedores.id"]),
        sa.ForeignKeyConstraint(["unidade_id"], ["unidades.id"]),
        sa.ForeignKeyConstraint(["contrato_posto_id"], ["contratos_posto.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_fechamentos_organization_id", "fechamentos", ["organization_id"])
    op.create_index("ix_fechamentos_unidade_id", "fechamentos", ["unidade_id"])
    op.create_index("ix_fechamentos_org_status", "fechamentos", ["organization_id", "status"])
    op.create_index("uq_fechamentos_org_codigo", "fechamentos", ["organization_id", "codigo"], unique=True)

    op.create_table(
        "fechamento_eventos",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("fechamento_id", sa.Uuid(), nullable=False),
        sa.Column("tipo", sa.String(40), nullable=False),
        sa.Column("descricao", sa.Text(), nullable=False),
        sa.Column("usuario_id", sa.Uuid(), nullable=True),
        sa.Column("dados", sa.Text(), nullable=True),
        *_ts(),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["fechamento_id"], ["fechamentos.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_fechamento_eventos_organization_id", "fechamento_eventos", ["organization_id"])
    op.create_index("ix_fechamento_eventos_fechamento_id", "fechamento_eventos", ["fechamento_id"])

    op.add_column("abastecimentos", sa.Column("fechamento_id", sa.Uuid(), nullable=True))
    op.create_foreign_key("fk_abastecimentos_fechamento", "abastecimentos", "fechamentos", ["fechamento_id"], ["id"])
    op.create_index("ix_abastecimentos_fechamento_id", "abastecimentos", ["fechamento_id"])


def downgrade() -> None:
    op.drop_index("ix_abastecimentos_fechamento_id", table_name="abastecimentos")
    op.drop_constraint("fk_abastecimentos_fechamento", "abastecimentos", type_="foreignkey")
    op.drop_column("abastecimentos", "fechamento_id")
    op.drop_table("fechamento_eventos")
    op.drop_table("fechamentos")
