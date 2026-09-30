"""Classificação ANP do combustível e manifestos de entrada (NF-e pendentes).

- combustiveis: `codigo_anp` e `especificacao` para homologação fiscal.
- manifestos_entrada: NF-e de combustível detectada/importada ainda não
  vinculada a um tanque (o "manifesto pendente").

Reverter em produção = restaurar o dump feito antes do upgrade.

Revision ID: 018
Revises: 017
Create Date: 2026-09-30
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "018"
down_revision: Union[str, None] = "017"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("combustiveis", sa.Column("codigo_anp", sa.String(20), nullable=True))
    op.add_column("combustiveis", sa.Column("especificacao", sa.String(120), nullable=True))

    op.create_table(
        "manifestos_entrada",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("chave_nfe", sa.String(44), nullable=True),
        sa.Column("numero", sa.String(50), nullable=True),
        sa.Column("serie", sa.String(20), nullable=True),
        sa.Column("emitente_nome", sa.String(255), nullable=True),
        sa.Column("emitente_cnpj", sa.String(20), nullable=True),
        sa.Column("data_emissao", sa.DateTime(timezone=True), nullable=True),
        sa.Column("combustivel_id", sa.Uuid(), nullable=True),
        sa.Column("descricao_item", sa.String(255), nullable=True),
        sa.Column("codigo_anp", sa.String(20), nullable=True),
        sa.Column("quantidade_litros", sa.Numeric(14, 2), nullable=True),
        sa.Column("valor_unitario", sa.Numeric(12, 4), nullable=True),
        sa.Column("valor_total", sa.Numeric(15, 2), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="PENDENTE"),
        sa.Column("origem", sa.String(30), nullable=False, server_default="MANUAL"),
        sa.Column("entrada_id", sa.Uuid(), nullable=True),
        sa.Column("anexo_id", sa.Uuid(), nullable=True),
        sa.Column("observacoes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["combustivel_id"], ["combustiveis.id"]),
        sa.ForeignKeyConstraint(["entrada_id"], ["entradas_combustivel.id"]),
        sa.ForeignKeyConstraint(["anexo_id"], ["anexos.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_manifestos_entrada_organization_id", "manifestos_entrada", ["organization_id"])
    op.create_index("ix_manifestos_entrada_status", "manifestos_entrada", ["status"])
    op.create_index("ix_manifestos_org_status", "manifestos_entrada", ["organization_id", "status"])
    op.create_index("ix_manifestos_org_chave", "manifestos_entrada", ["organization_id", "chave_nfe"])


def downgrade() -> None:
    op.drop_index("ix_manifestos_org_chave", table_name="manifestos_entrada")
    op.drop_index("ix_manifestos_org_status", table_name="manifestos_entrada")
    op.drop_index("ix_manifestos_entrada_status", table_name="manifestos_entrada")
    op.drop_index("ix_manifestos_entrada_organization_id", table_name="manifestos_entrada")
    op.drop_table("manifestos_entrada")
    op.drop_column("combustiveis", "especificacao")
    op.drop_column("combustiveis", "codigo_anp")
