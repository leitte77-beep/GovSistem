"""Add agenda_horarios, agenda_bloqueios, and appointment.motivo_cancelamento (Fase 3.5)

Revision ID: 022
Revises: 021
Create Date: 2026-07-14
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "022"
down_revision: Union[str, None] = "021"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "agenda_horarios",
        sa.Column("id", sa.UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", sa.String(36), nullable=False, index=True),
        sa.Column("professional_id", sa.UUID(), nullable=True),
        sa.Column("unit_id", sa.UUID(), nullable=True),
        sa.Column("equipe_id", sa.UUID(), nullable=True),
        sa.Column("especialidade_id", sa.UUID(), nullable=True),
        sa.Column("dia_semana", sa.Integer(), nullable=False, comment="0=Seg ... 6=Dom"),
        sa.Column("hora_inicio", sa.String(5), nullable=False, comment="HH:MM"),
        sa.Column("hora_fim", sa.String(5), nullable=False, comment="HH:MM"),
        sa.Column("duracao_minutos", sa.Integer(), nullable=False, server_default="30"),
        sa.Column("data_inicio", sa.DateTime(), nullable=False),
        sa.Column("data_fim", sa.DateTime(), nullable=True),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_table(
        "agenda_bloqueios",
        sa.Column("id", sa.UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", sa.String(36), nullable=False, index=True),
        sa.Column("professional_id", sa.UUID(), nullable=True),
        sa.Column("unit_id", sa.UUID(), nullable=True),
        sa.Column("data", sa.DateTime(), nullable=False),
        sa.Column("hora_inicio", sa.String(5), nullable=True),
        sa.Column("hora_fim", sa.String(5), nullable=True),
        sa.Column("motivo", sa.String(200), nullable=True),
        sa.Column("recorrente_anual", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column("appointments", sa.Column("motivo_cancelamento", sa.String(200), nullable=True))


def downgrade() -> None:
    op.drop_column("appointments", "motivo_cancelamento")
    op.drop_table("agenda_bloqueios")
    op.drop_table("agenda_horarios")
