"""Create beneficios_recorrentes, entregas_programadas, beneficios_coletivos (Fase 3.9)

Revision ID: 026
Revises: 025
Create Date: 2026-07-14
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSON

revision: str = "026"
down_revision: Union[str, None] = "025"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table("beneficios_recorrentes",
        sa.Column("id", sa.UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", sa.String(36), nullable=False, index=True),
        sa.Column("benefit_type_code", sa.String(40), nullable=False),
        sa.Column("family_id", sa.UUID(), sa.ForeignKey("families.id", ondelete="CASCADE"), nullable=False),
        sa.Column("person_id", sa.UUID(), sa.ForeignKey("persons.id", ondelete="SET NULL"), nullable=True),
        sa.Column("unit_id", sa.UUID(), sa.ForeignKey("units.id", ondelete="CASCADE"), nullable=False),
        sa.Column("periodicidade", sa.String(20), nullable=False),
        sa.Column("quantidade", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("valor", sa.Numeric(12, 2), nullable=True),
        sa.Column("data_inicio", sa.DateTime(), nullable=False),
        sa.Column("data_fim", sa.DateTime(), nullable=True),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("entrega_automatica", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("observacoes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_table("entregas_programadas",
        sa.Column("id", sa.UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", sa.String(36), nullable=False, index=True),
        sa.Column("beneficio_recorrente_id", sa.UUID(), sa.ForeignKey("beneficios_recorrentes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("data_prevista", sa.DateTime(), nullable=False),
        sa.Column("data_entrega", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="PENDENTE"),
        sa.Column("quantidade", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("profissional_id", sa.UUID(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_table("beneficios_coletivos",
        sa.Column("id", sa.UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", sa.String(36), nullable=False, index=True),
        sa.Column("benefit_type_code", sa.String(40), nullable=False),
        sa.Column("unit_id", sa.UUID(), sa.ForeignKey("units.id", ondelete="CASCADE"), nullable=False),
        sa.Column("grupo_id", sa.UUID(), nullable=True),
        sa.Column("data", sa.DateTime(timezone=True), nullable=False),
        sa.Column("descricao", sa.Text(), nullable=True),
        sa.Column("participantes", JSON, nullable=True),
        sa.Column("profissionais", JSON, nullable=True),
        sa.Column("registrado_por_id", sa.UUID(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("beneficios_coletivos")
    op.drop_table("entregas_programadas")
    op.drop_table("beneficios_recorrentes")
