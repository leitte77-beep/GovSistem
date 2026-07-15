"""Create GovSocial SICON tables (condicionalidades)

Revision ID: 012
Revises: 011
Create Date: 2026-07-14
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "012"
down_revision: Union[str, None] = "011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "sicon_data",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("family_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("families.id", ondelete="SET NULL"), nullable=True),
        sa.Column("nis_responsavel", sa.String(11), nullable=False),
        sa.Column("data_referencia", sa.Date(), nullable=False),
        sa.Column("descumprimento_educacao", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("descumprimento_saude", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("efeito_beneficio", sa.String(30), nullable=True),
        sa.Column("data_efeito", sa.Date(), nullable=True),
        sa.Column("membros_afetados", sa.Text(), nullable=True),
        sa.Column("observacoes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_sicon_tenant_nis", "sicon_data", ["tenant_id", "nis_responsavel"])
    op.create_index("ix_sicon_tenant_family", "sicon_data", ["tenant_id", "family_id"])
    op.create_index("ix_sicon_tenant_referencia", "sicon_data", ["tenant_id", "data_referencia"])


def downgrade() -> None:
    op.drop_table("sicon_data")
