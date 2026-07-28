"""Create ivs_criterios and ivs_calculos tables (Fase 3.6)

Revision ID: 024
Revises: 023
Create Date: 2026-07-14
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "024"
down_revision: Union[str, None] = "023"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table("ivs_criterios",
        sa.Column("id", sa.UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", sa.String(36), nullable=False, index=True),
        sa.Column("nome", sa.String(100), nullable=False),
        sa.Column("descricao", sa.Text(), nullable=True),
        sa.Column("peso", sa.Float(), nullable=False, server_default="1.0"),
        sa.Column("formula", sa.String(50), nullable=False),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_table("ivs_calculos",
        sa.Column("id", sa.UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", sa.String(36), nullable=False, index=True),
        sa.Column("family_id", sa.UUID(), sa.ForeignKey("families.id", ondelete="CASCADE"), nullable=False),
        sa.Column("pontuacao", sa.Float(), nullable=False),
        sa.Column("nivel", sa.String(20), nullable=False),
        sa.Column("automatico", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("alterado_por_id", sa.UUID(), nullable=True),
        sa.Column("justificativa", sa.Text(), nullable=True),
        sa.Column("data_calculo", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )


def downgrade() -> None:
    op.drop_table("ivs_calculos")
    op.drop_table("ivs_criterios")
