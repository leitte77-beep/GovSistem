"""Remove fechamentos, conciliação e atesto: o faturamento passa a ser a
nota fiscal por abastecimento (016). Reverter = restaurar o dump anterior.

Revision ID: 017
Revises: 016
Create Date: 2026-09-29
"""
from typing import Sequence, Union

from alembic import op

revision: str = "017"
down_revision: Union[str, None] = "016"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE abastecimentos DROP CONSTRAINT IF EXISTS fk_abastecimentos_fechamento")
    op.execute("DROP INDEX IF EXISTS ix_abastecimentos_fechamento_id")
    op.execute("ALTER TABLE abastecimentos DROP COLUMN IF EXISTS fechamento_id")
    for tabela in ("fechamento_conciliacoes", "fechamento_eventos", "fechamento_documentos", "fechamentos"):
        op.execute(f"DROP TABLE IF EXISTS {tabela} CASCADE")


def downgrade() -> None:
    raise NotImplementedError("Sem volta: restaure o dump feito antes da 017.")
