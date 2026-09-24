"""Espelho da última movimentação do pedido.

Responde "esta demanda está parada há quantos dias?" sem varrer `andamentos`
a cada listagem. É espelho, como `fase_atual_codigo`: quem escreve é
`services.pedidos.registrar`, o único ponto que grava na timeline.

Revision ID: 0004_movimentacao
Revises: 0003_config
Create Date: 2026-09-23
"""

import sqlalchemy as sa
from alembic import op

revision = "0004_movimentacao"
down_revision = "0003_config"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "pedidos",
        sa.Column("ultima_movimentacao_em", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_pedidos_ultima_movimentacao",
        "pedidos",
        ["ultima_movimentacao_em"],
    )
    # Backfill: o último andamento; sem nenhum, a abertura do pedido.
    op.execute(
        """
        UPDATE pedidos p
        SET ultima_movimentacao_em = COALESCE(
            (SELECT max(a.created_at) FROM andamentos a WHERE a.pedido_id = p.id),
            p.created_at
        )
        """
    )


def downgrade() -> None:
    op.drop_index("ix_pedidos_ultima_movimentacao", table_name="pedidos")
    op.drop_column("pedidos", "ultima_movimentacao_em")
