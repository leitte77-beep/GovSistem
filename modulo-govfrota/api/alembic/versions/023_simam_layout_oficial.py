"""SIM-AM: campos de Entrada/SaidaExtraCombustivel conforme o layout oficial 1.2b.

flEntidadeRepassador/Recebedor, cdControleLeiAto e objeto do convênio com até
1.000 caracteres. Remove lei_ato_numero/lei_ato_ano (sem dados em produção).

Revision ID: 023
Revises: 022
Create Date: 2026-09-30
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "023"
down_revision: Union[str, None] = "022"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("entradas_combustivel", sa.Column("repassador_entidade_tce", sa.Boolean(), server_default="false", nullable=False))
    op.add_column("entradas_combustivel", sa.Column("lei_ato_codigo", sa.Integer(), nullable=True))
    op.drop_column("entradas_combustivel", "lei_ato_numero")
    op.drop_column("entradas_combustivel", "lei_ato_ano")
    op.alter_column("entradas_combustivel", "convenio_objeto", type_=sa.Text())
    op.add_column("saidas_extra_combustivel", sa.Column("recebedor_entidade_tce", sa.Boolean(), nullable=True))
    op.add_column("saidas_extra_combustivel", sa.Column("lei_ato_codigo", sa.Integer(), nullable=True))
    op.alter_column("saidas_extra_combustivel", "convenio_objeto", type_=sa.Text())


def downgrade() -> None:
    op.alter_column("saidas_extra_combustivel", "convenio_objeto", type_=sa.String(250))
    op.drop_column("saidas_extra_combustivel", "lei_ato_codigo")
    op.drop_column("saidas_extra_combustivel", "recebedor_entidade_tce")
    op.alter_column("entradas_combustivel", "convenio_objeto", type_=sa.String(250))
    op.add_column("entradas_combustivel", sa.Column("lei_ato_ano", sa.Integer(), nullable=True))
    op.add_column("entradas_combustivel", sa.Column("lei_ato_numero", sa.String(20), nullable=True))
    op.drop_column("entradas_combustivel", "lei_ato_codigo")
    op.drop_column("entradas_combustivel", "repassador_entidade_tce")
