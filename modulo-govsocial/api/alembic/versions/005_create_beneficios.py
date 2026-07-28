"""Create GovSocial FASE 5 tables (benefícios eventuais)

Revision ID: 005
Revises: 004
Create Date: 2026-07-09
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "unit_stocks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("unit_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("units.id", ondelete="CASCADE"), nullable=False),
        sa.Column("benefit_type_code", sa.String(40), nullable=False),
        sa.Column("quantidade_atual", sa.Numeric(12, 2), nullable=False, server_default=sa.text("0")),
        sa.Column("quantidade_minima", sa.Numeric(12, 2), nullable=False, server_default=sa.text("0")),
        sa.Column("unidade_medida", sa.String(30), nullable=False, server_default=sa.text("'UNIDADE'")),
        sa.Column("valor_unitario_referencia", sa.Numeric(12, 2), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_stock_tenant_unit", "unit_stocks", ["tenant_id", "unit_id"])
    op.create_index("ix_stock_tenant_benefit", "unit_stocks", ["tenant_id", "benefit_type_code"])

    op.create_table(
        "benefit_concessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("family_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("families.id", ondelete="CASCADE"), nullable=False),
        sa.Column("person_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("persons.id", ondelete="SET NULL"), nullable=True),
        sa.Column("unit_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("units.id", ondelete="CASCADE"), nullable=False),
        sa.Column("benefit_type_code", sa.String(40), nullable=False),
        sa.Column("quantidade", sa.Numeric(12, 2), nullable=False, server_default=sa.text("1")),
        sa.Column("valor_total", sa.Numeric(12, 2), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'SOLICITADO'")),
        sa.Column("data_solicitacao", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("data_analise", sa.DateTime(timezone=True), nullable=True),
        sa.Column("data_aprovacao", sa.DateTime(timezone=True), nullable=True),
        sa.Column("data_entrega", sa.DateTime(timezone=True), nullable=True),
        sa.Column("solicitado_por_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("professionals.id", ondelete="SET NULL"), nullable=True),
        sa.Column("analisado_por_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("professionals.id", ondelete="SET NULL"), nullable=True),
        sa.Column("aprovado_por_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("professionals.id", ondelete="SET NULL"), nullable=True),
        sa.Column("parecer_enc", sa.Text(), nullable=True),
        sa.Column("motivo_negacao", sa.Text(), nullable=True),
        sa.Column("comprovante_gerado", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("assinatura_data", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_concessao_tenant_family", "benefit_concessions", ["tenant_id", "family_id"])
    op.create_index("ix_concessao_tenant_status", "benefit_concessions", ["tenant_id", "status"])
    op.create_index("ix_concessao_tenant_unit", "benefit_concessions", ["tenant_id", "unit_id"])
    op.create_index("ix_concessao_tenant_benefit", "benefit_concessions", ["tenant_id", "benefit_type_code"])
    op.create_index("ix_concessao_tenant_data", "benefit_concessions", ["tenant_id", "data_solicitacao"])


def downgrade() -> None:
    op.drop_table("benefit_concessions")
    op.drop_table("unit_stocks")
