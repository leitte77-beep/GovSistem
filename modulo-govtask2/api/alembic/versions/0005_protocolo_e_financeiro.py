"""Protocolo estruturado e acompanhamento financeiro mínimo.

O protocolo deixa de ser só um número solto e ganha sistema, órgão e data —
o que a auditoria precisa para conferir. E o pedido guarda o valor liberado
pelo órgão e o valor pago, sem virar um segundo módulo contábil.

Revision ID: 0005_protocolo_fin
Revises: 0004_movimentacao
Create Date: 2026-09-23
"""

import sqlalchemy as sa
from alembic import op

revision = "0005_protocolo_fin"
down_revision = "0004_movimentacao"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("pedidos", sa.Column("protocolo_sistema", sa.String(80), nullable=True))
    op.add_column("pedidos", sa.Column("protocolo_orgao", sa.String(180), nullable=True))
    op.add_column("pedidos", sa.Column("protocolo_data", sa.Date(), nullable=True))
    op.add_column("pedidos", sa.Column("valor_liberado", sa.Numeric(14, 2), nullable=True))
    op.add_column("pedidos", sa.Column("valor_pago", sa.Numeric(14, 2), nullable=True))


def downgrade() -> None:
    for coluna in (
        "valor_pago",
        "valor_liberado",
        "protocolo_data",
        "protocolo_orgao",
        "protocolo_sistema",
    ):
        op.drop_column("pedidos", coluna)
