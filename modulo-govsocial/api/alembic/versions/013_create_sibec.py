"""Create GovSocial Sibec tables (beneficios do cidadao)

Revision ID: 013
Revises: 012
Create Date: 2026-07-14
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "013"
down_revision: Union[str, None] = "012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "sibec_data",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("family_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("families.id", ondelete="SET NULL"), nullable=True),
        sa.Column("person_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("persons.id", ondelete="SET NULL"), nullable=True),
        sa.Column("nis", sa.String(11), nullable=False),
        sa.Column("nome_beneficiario", sa.String(255), nullable=True),
        sa.Column("tipo_beneficio", sa.String(40), nullable=False),
        sa.Column("valor", sa.Numeric(12, 2), nullable=True),
        sa.Column("data_concessao", sa.Date(), nullable=True),
        sa.Column("data_referencia", sa.Date(), nullable=False),
        sa.Column("situacao", sa.String(30), nullable=True),
        sa.Column("data_bloqueio", sa.Date(), nullable=True),
        sa.Column("motivo_bloqueio", sa.Text(), nullable=True),
        sa.Column("data_desbloqueio", sa.Date(), nullable=True),
        sa.Column("observacoes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_sibec_tenant_nis", "sibec_data", ["tenant_id", "nis"])
    op.create_index("ix_sibec_tenant_family", "sibec_data", ["tenant_id", "family_id"])
    op.create_index("ix_sibec_tenant_referencia", "sibec_data", ["tenant_id", "data_referencia"])


def downgrade() -> None:
    op.drop_table("sibec_data")
