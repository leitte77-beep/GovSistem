"""matriz de assinatura por tipo de ato/documento

Revision ID: 0003_matriz_assinatura
Revises: 0002_assinatura_icp
Create Date: 2026-08-13
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSON

revision = "0003_matriz_assinatura"
down_revision = "0002_assinatura_icp"
branch_labels = None
depends_on = None


_COLUNAS = {
    "perfis_autorizados": sa.Column("perfis_autorizados", JSON(), nullable=True),
    "qtd_assinaturas_minima": sa.Column(
        "qtd_assinaturas_minima", sa.Integer(), nullable=False, server_default="1"
    ),
    "assinatura_sequencial": sa.Column(
        "assinatura_sequencial", sa.Boolean(), nullable=False, server_default=sa.false()
    ),
    "exige_assinatura_externa": sa.Column(
        "exige_assinatura_externa", sa.Boolean(), nullable=False, server_default=sa.false()
    ),
    "permite_bloco": sa.Column(
        "permite_bloco", sa.Boolean(), nullable=False, server_default=sa.true()
    ),
    "fundamento_normativo": sa.Column("fundamento_normativo", sa.Text(), nullable=True),
}


def upgrade() -> None:
    # Idempotente: em base FRESCA o `0001_nucleo` (create_all) já cria as colunas
    # a partir dos models; em base EXISTENTE este passo adiciona o que faltar.
    bind = op.get_bind()
    existentes = {c["name"] for c in sa.inspect(bind).get_columns("tipos_documento")}
    for nome, coluna in _COLUNAS.items():
        if nome not in existentes:
            op.add_column("tipos_documento", coluna)


def downgrade() -> None:
    bind = op.get_bind()
    existentes = {c["name"] for c in sa.inspect(bind).get_columns("tipos_documento")}
    for nome in _COLUNAS:
        if nome in existentes:
            op.drop_column("tipos_documento", nome)
