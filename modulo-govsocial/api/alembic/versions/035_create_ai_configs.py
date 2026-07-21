"""Create ai_configs table

Revision ID: 035
Revises: 034
Create Date: 2026-07-21
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision: str = "035"
down_revision: Union[str, None] = "034"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ai_configs",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("tenant_id", sa.String(36), nullable=False, unique=True),
        sa.Column("provider", sa.String(30), nullable=False, server_default="openai"),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column(
            "encrypted_password",
            sa.Text(),
            nullable=False,
            comment="API key da OpenAI criptografada com Fernet (coluna-level encryption)",
        ),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("max_tokens", sa.Integer(), nullable=False, server_default="4096"),
        sa.Column("model", sa.String(50), nullable=False, server_default="gpt-4o-mini"),
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
    op.create_index("ix_ai_configs_tenant_id", "ai_configs", ["tenant_id"])


def downgrade() -> None:
    op.drop_table("ai_configs")
