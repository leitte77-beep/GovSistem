"""Conversa na tarefa, documentos tipados e ficha completa do pedido.

Revision ID: 0008_conversa_ficha
Revises: 0007_parada_ajustes
Create Date: 2026-09-23
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0008_conversa_ficha"
down_revision = "0007_parada_ajustes"
branch_labels = None
depends_on = None

PEDIDO = [
    ("partido", sa.String(30)),
    ("endereco", sa.String(255)),
    ("latitude", sa.Numeric(9, 6)),
    ("longitude", sa.Numeric(9, 6)),
    ("valor_empenhado", sa.Numeric(14, 2)),
    ("protocolo_situacao", sa.String(255)),
]


def upgrade() -> None:
    for nome, tipo in PEDIDO:
        op.add_column("pedidos", sa.Column(nome, tipo, nullable=True))
    op.add_column("encaminhamentos", sa.Column("rascunho", sa.Text(), nullable=True))
    op.add_column(
        "encaminhamentos", sa.Column("rascunho_em", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "encaminhamentos",
        sa.Column("checklist", postgresql.JSONB(), nullable=False, server_default="[]"),
    )
    op.add_column("anexos", sa.Column("tipo_documento", sa.String(20), nullable=True))
    op.add_column("anexos", sa.Column("legenda", sa.String(255), nullable=True))
    op.add_column("andamentos", sa.Column("dados", postgresql.JSONB(), nullable=True))
    # Fotos já existentes ganham o tipo, para o filtro funcionar desde o início.
    op.execute("UPDATE anexos SET tipo_documento = 'FOTO' WHERE categoria = 'FOTO'")


def downgrade() -> None:
    op.drop_column("andamentos", "dados")
    op.drop_column("anexos", "legenda")
    op.drop_column("anexos", "tipo_documento")
    op.drop_column("encaminhamentos", "checklist")
    op.drop_column("encaminhamentos", "rascunho_em")
    op.drop_column("encaminhamentos", "rascunho")
    for nome, _ in reversed(PEDIDO):
        op.drop_column("pedidos", nome)
