"""Reservatórios do veículo (principal + auxiliar) e categoria de produto.

Revision ID: 006
Revises: 005
Create Date: 2026-08-26
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()

    # 1) Categoria de produto — default COMBUSTIVEL preserva todos os existentes.
    op.add_column(
        "combustiveis",
        sa.Column("categoria", sa.String(20), nullable=False, server_default="COMBUSTIVEL"),
    )
    op.create_index(
        "ix_combustiveis_categoria", "combustiveis", ["categoria"]
    )

    # 2) Tabela de reservatórios do veículo (modelagem genérica escalável).
    op.create_table(
        "veiculos_tanques",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("veiculo_id", sa.Uuid(), nullable=False),
        sa.Column("combustivel_id", sa.Uuid(), nullable=False),
        sa.Column("tank_type", sa.String(20), nullable=False, server_default="AUXILIARY"),
        sa.Column("capacidade", sa.Numeric(14, 2), nullable=False),
        sa.Column("identificacao", sa.String(150), nullable=True),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["combustivel_id"], ["combustiveis.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["veiculo_id"], ["veiculos.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_veiculo_tanque_org_veiculo",
        "veiculos_tanques",
        ["organization_id", "veiculo_id"],
    )
    op.create_index("ix_veiculo_tanque_combustivel", "veiculos_tanques", ["combustivel_id"])

    # 3) Backfill: cria o reservatório PRIMARY para veículos existentes.
    #    Preserva todos os cadastros — nenhum dado é perdido ou exigido à mão.
    rows = bind.execute(
        sa.text(
            "SELECT id, organization_id, combustivel_principal_id, "
            "coalesce(capacidade_tanque_litros, 0) AS capacidade "
            "FROM veiculos WHERE deleted_at IS NULL AND combustivel_principal_id IS NOT NULL"
        )
    ).fetchall()
    now = sa.text("NOW()")
    for vid, org_id, comb_id, capacidade in rows:
        exists = bind.execute(
            sa.text(
                "SELECT 1 FROM veiculos_tanques WHERE veiculo_id = :vid AND tank_type = 'PRIMARY'"
            ),
            {"vid": vid},
        ).first()
        if exists:
            continue
        bind.execute(
            sa.text(
                "INSERT INTO veiculos_tanques "
                "(id, organization_id, veiculo_id, combustivel_id, tank_type, capacidade, "
                "identificacao, ativo, created_at, updated_at) "
                "VALUES (gen_random_uuid(), :org, :vid, :comb, 'PRIMARY', :cap, NULL, true, NOW(), NOW())"
            ),
            {"org": org_id, "vid": vid, "comb": comb_id, "cap": capacidade},
        )


def downgrade() -> None:
    op.drop_index("ix_veiculo_tanque_combustivel", table_name="veiculos_tanques")
    op.drop_index("ix_veiculo_tanque_org_veiculo", table_name="veiculos_tanques")
    op.drop_table("veiculos_tanques")
    op.drop_index("ix_combustiveis_categoria", table_name="combustiveis")
    op.drop_column("combustiveis", "categoria")
