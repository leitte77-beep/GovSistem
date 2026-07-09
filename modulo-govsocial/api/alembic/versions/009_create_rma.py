"""Create GovSocial FASE 9 tables (RMA)

Revision ID: 009
Revises: 008
Create Date: 2026-07-09
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "009"
down_revision: Union[str, None] = "008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "rma_fechamentos",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("unit_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("units.id", ondelete="CASCADE"), nullable=False),
        sa.Column("ano", sa.Integer(), nullable=False),
        sa.Column("mes", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'ABERTO'")),
        sa.Column("fechado_por_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("fechado_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reaberto_por_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("reaberto_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("motivo_reabertura", sa.Text(), nullable=True),
        sa.Column("dados_calculados", postgresql.JSON(), nullable=True),
        sa.Column("calculado_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("tenant_id", "unit_id", "ano", "mes", name="uq_rma_unit_ano_mes"),
    )
    op.create_index("ix_rma_tenant_unit", "rma_fechamentos", ["tenant_id", "unit_id"])
    op.create_index("ix_rma_tenant_status", "rma_fechamentos", ["tenant_id", "status"])

    op.create_table(
        "rma_ajustes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("fechamento_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("rma_fechamentos.id", ondelete="CASCADE"), nullable=False),
        sa.Column("bloco", sa.String(50), nullable=False),
        sa.Column("campo", sa.String(100), nullable=False),
        sa.Column("valor_calculado", sa.Integer(), nullable=False),
        sa.Column("valor_ajustado", sa.Integer(), nullable=False),
        sa.Column("justificativa", sa.Text(), nullable=False),
        sa.Column("ajustado_por_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_rma_ajuste_fechamento", "rma_ajustes", ["tenant_id", "fechamento_id"])


def downgrade() -> None:
    op.drop_table("rma_ajustes")
    op.drop_table("rma_fechamentos")
