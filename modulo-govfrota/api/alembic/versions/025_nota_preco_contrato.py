"""Nota do posto: litros/preço/km lidos e opção de recusar preço acima do contrato.

Revision ID: 025
Revises: 024
Create Date: 2026-10-01
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "025"
down_revision: Union[str, None] = "024"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("govfrota_configuracoes", sa.Column("bloquear_nota_preco_acima_contrato", sa.Boolean(), server_default="false", nullable=False))
    op.add_column("abastecimento_notas", sa.Column("nfe_litros", sa.Numeric(14, 3), nullable=True))
    op.add_column("abastecimento_notas", sa.Column("nfe_preco_unitario", sa.Numeric(12, 4), nullable=True))
    op.add_column("abastecimento_notas", sa.Column("nfe_km", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("abastecimento_notas", "nfe_km")
    op.drop_column("abastecimento_notas", "nfe_preco_unitario")
    op.drop_column("abastecimento_notas", "nfe_litros")
    op.drop_column("govfrota_configuracoes", "bloquear_nota_preco_acima_contrato")
