"""Create notification_channel_configs table

Revision ID: 036
Revises: 035
Create Date: 2026-07-21
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision: str = "036"
down_revision: Union[str, None] = "035"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "notification_channel_configs",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("tenant_id", UUID(as_uuid=True), nullable=False),
        sa.Column(
            "channel",
            sa.String(20),
            nullable=False,
            comment="EMAIL | WHATSAPP | PUSH | SMS",
        ),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column(
            "config_json",
            sa.JSON(),
            nullable=False,
            comment="Credenciais criptografadas especificas do canal",
        ),
        sa.Column(
            "label",
            sa.String(100),
            nullable=True,
            comment="Nome amigavel para identificacao na UI",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
        ),
    )
    op.create_index(
        "ix_notification_channel_configs_tenant_id",
        "notification_channel_configs",
        ["tenant_id"],
    )


def downgrade() -> None:
    op.drop_table("notification_channel_configs")
