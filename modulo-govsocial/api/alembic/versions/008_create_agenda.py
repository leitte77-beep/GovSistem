"""Create GovSocial FASE 8 tables (agenda e visitas)

Revision ID: 008
Revises: 007
Create Date: 2026-07-09
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "008"
down_revision: Union[str, None] = "007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "appointments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("unit_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("units.id", ondelete="CASCADE"), nullable=False),
        sa.Column("professional_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("professionals.id", ondelete="SET NULL"), nullable=True),
        sa.Column("person_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("persons.id", ondelete="SET NULL"), nullable=True),
        sa.Column("family_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("families.id", ondelete="SET NULL"), nullable=True),
        sa.Column("tipo", sa.String(30), nullable=False, server_default=sa.text("'ATENDIMENTO'")),
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'AGENDADO'")),
        sa.Column("data_hora_inicio", sa.DateTime(timezone=True), nullable=False),
        sa.Column("data_hora_fim", sa.DateTime(timezone=True), nullable=True),
        sa.Column("observacoes", sa.Text(), nullable=True),
        sa.Column("senha", sa.String(10), nullable=True),
        sa.Column("lembrete_enviado", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("opt_in_lembrete", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_appt_tenant_unit", "appointments", ["tenant_id", "unit_id"])
    op.create_index("ix_appt_tenant_prof", "appointments", ["tenant_id", "professional_id"])
    op.create_index("ix_appt_tenant_data", "appointments", ["tenant_id", "data_hora_inicio"])
    op.create_index("ix_appt_tenant_status", "appointments", ["tenant_id", "status"])

    op.create_table(
        "visitas_domiciliares",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("family_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("families.id", ondelete="CASCADE"), nullable=False),
        sa.Column("unit_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("units.id", ondelete="CASCADE"), nullable=False),
        sa.Column("professional_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("professionals.id", ondelete="SET NULL"), nullable=True),
        sa.Column("attendance_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("attendances.id", ondelete="SET NULL"), nullable=True),
        sa.Column("data_planejada", sa.DateTime(timezone=True), nullable=False),
        sa.Column("data_realizada", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'PLANEJADA'")),
        sa.Column("endereco_confirmado", sa.Text(), nullable=True),
        sa.Column("observacoes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_vd_tenant_family", "visitas_domiciliares", ["tenant_id", "family_id"])
    op.create_index("ix_vd_tenant_prof", "visitas_domiciliares", ["tenant_id", "professional_id"])
    op.create_index("ix_vd_tenant_status", "visitas_domiciliares", ["tenant_id", "status"])


def downgrade() -> None:
    op.drop_table("visitas_domiciliares")
    op.drop_table("appointments")
