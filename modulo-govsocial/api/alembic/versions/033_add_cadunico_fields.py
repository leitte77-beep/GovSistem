"""Adiciona campos complementares do CadÚnico em families e persons

Revision ID: 033
Revises: 032
Create Date: 2026-07-14
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

revision: str = "033"
down_revision: Union[str, None] = "032"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _col_exists(table: str, column: str) -> bool:
    conn = op.get_bind()
    result = conn.execute(
        text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name = :tbl AND column_name = :col"
        ),
        {"tbl": table, "col": column},
    )
    return result.scalar() is not None


def _add_col(table: str, column: str, col_type, **kwargs):
    if not _col_exists(table, column):
        op.add_column(table, sa.Column(column, col_type, **kwargs))


def upgrade() -> None:
    # Families — campos CadÚnico
    _add_col("families", "ponto_referencia", sa.String(255), nullable=True)
    _add_col("families", "telefone_contato", sa.String(20), nullable=True)
    _add_col("families", "situacao_rua", sa.Boolean(), nullable=False, server_default=sa.text("false"))
    _add_col("families", "data_cadastramento", sa.Date(), nullable=True)
    _add_col("families", "despesa_aluguel", sa.Float(), nullable=True)
    _add_col("families", "despesa_transporte", sa.Float(), nullable=True)
    _add_col("families", "despesa_alimentacao", sa.Float(), nullable=True)
    _add_col("families", "despesa_medicamentos", sa.Float(), nullable=True)
    _add_col("families", "despesa_outros", sa.Float(), nullable=True)

    # Persons — campos CadÚnico
    _add_col("persons", "raca_cor", sa.String(20), nullable=True)
    _add_col("persons", "estado_civil", sa.String(30), nullable=True)
    _add_col("persons", "frequenta_escola", sa.Boolean(), nullable=True)
    _add_col("persons", "situacao_mercado_trabalho", sa.String(30), nullable=True)
    _add_col("persons", "gestante", sa.Boolean(), nullable=True)
    _add_col("persons", "amamentando", sa.Boolean(), nullable=True)
    _add_col("persons", "renda_mensal", sa.Float(), nullable=True)


def downgrade() -> None:
    op.drop_column("families", "ponto_referencia")
    op.drop_column("families", "telefone_contato")
    op.drop_column("families", "situacao_rua")
    op.drop_column("families", "data_cadastramento")
    op.drop_column("families", "despesa_aluguel")
    op.drop_column("families", "despesa_transporte")
    op.drop_column("families", "despesa_alimentacao")
    op.drop_column("families", "despesa_medicamentos")
    op.drop_column("families", "despesa_outros")
    op.drop_column("persons", "raca_cor")
    op.drop_column("persons", "estado_civil")
    op.drop_column("persons", "frequenta_escola")
    op.drop_column("persons", "situacao_mercado_trabalho")
    op.drop_column("persons", "gestante")
    op.drop_column("persons", "amamentando")
    op.drop_column("persons", "renda_mensal")
