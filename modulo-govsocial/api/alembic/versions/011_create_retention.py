"""Create GovSocial FASE 12 tables (retenção LGPD)

Revision ID: 011
Revises: 010
Create Date: 2026-07-09
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "011"
down_revision: Union[str, None] = "010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "retention_policies",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("categoria", sa.String(50), nullable=False),
        sa.Column("retencao_dias", sa.Integer(), nullable=False, server_default=sa.text("1825")),
        sa.Column("acao", sa.String(20), nullable=False, server_default=sa.text("'ANONIMIZAR'")),
        sa.Column("base_legal", sa.String(255), nullable=False, server_default=sa.text("'LGPD art. 16, I — cumprimento de obrigação legal'")),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_retpol_tenant", "retention_policies", ["tenant_id"])


def downgrade() -> None:
    op.drop_table("retention_policies")
