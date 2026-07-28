"""Create teleatendimentos table (Fase 3.14)

Revision ID: 031
Revises: 030
Create Date: 2026-07-14
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "031"
down_revision: Union[str, None] = "030"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table("teleatendimentos",
        sa.Column("id", sa.UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", sa.String(36), nullable=False, index=True),
        sa.Column("unit_id", sa.UUID(), nullable=False),
        sa.Column("profissional_id", sa.UUID(), nullable=True),
        sa.Column("person_id", sa.UUID(), nullable=True),
        sa.Column("sala_id", sa.String(36), unique=True, nullable=False),
        sa.Column("codigo_acesso", sa.String(10), nullable=False),
        sa.Column("link", sa.Text(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="AGUARDANDO"),
        sa.Column("aceite_termo", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("observacoes", sa.Text(), nullable=True),
        sa.Column("attendance_id", sa.UUID(), nullable=True),
        sa.Column("registrado_por_id", sa.UUID(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )


def downgrade() -> None:
    op.drop_table("teleatendimentos")
