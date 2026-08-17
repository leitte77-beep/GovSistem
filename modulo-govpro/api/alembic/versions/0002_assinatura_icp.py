"""assinatura qualificada ICP-Brasil — artefato de assinatura

Revision ID: 0002_assinatura_icp
Revises: 0001_nucleo
Create Date: 2026-08-13
"""

import sqlalchemy as sa
from alembic import op

revision = "0002_assinatura_icp"
down_revision = "0001_nucleo"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Idempotente: em base FRESCA o `0001_nucleo` (create_all) já cria a coluna;
    # em base EXISTENTE (produção) o create_all não a adiciona — este passo cobre.
    bind = op.get_bind()
    colunas = {c["name"] for c in sa.inspect(bind).get_columns("assinaturas")}
    if "assinatura_b64" not in colunas:
        op.add_column("assinaturas", sa.Column("assinatura_b64", sa.Text(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    colunas = {c["name"] for c in sa.inspect(bind).get_columns("assinaturas")}
    if "assinatura_b64" in colunas:
        op.drop_column("assinaturas", "assinatura_b64")
