"""Concorrência otimista na demanda: coluna `demandas.versao` (§120).

Duas pessoas editando a mesma demanda ao mesmo tempo podiam sobrescrever uma à
outra: o PATCH aplicava os campos que chegaram por último, sem perceber que o
registro já tinha mudado desde a leitura. A coluna `versao` dá ao cliente um
número para enviar em `versao_esperada`; se ele não bater, o servidor recusa
(409) em vez de perder a alteração alheia.

Aditiva e sem conversão: demandas existentes começam na versão 1.

Revision ID: d5e6f7a8b9c0
Revises: d4e5f6a7b8c9
"""

from alembic import op
import sqlalchemy as sa

revision = "d5e6f7a8b9c0"
down_revision = "d4e5f6a7b8c9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "demandas",
        sa.Column(
            "versao",
            sa.Integer(),
            nullable=False,
            server_default="1",
            comment="Controle de concorrência otimista (§120): incrementa a cada alteração",
        ),
    )


def downgrade() -> None:
    op.drop_column("demandas", "versao")
