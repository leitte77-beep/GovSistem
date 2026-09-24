"""add ai_configs and ai_executions (centralized DeepSeek integration)

Revision ID: d4e5f6a7b8c9
Revises: 3e4a5b6c7d8e
Create Date: 2026-09-09

- ``ai_configs``: one per-organization AI configuration (single shared DeepSeek
  provider/model). The API key is stored encrypted-at-rest (``api_key_ciphertext``)
  with only a masked hint (``api_key_masked``) exposed to clients.
- ``ai_executions``: auditable log of every AI operation (status, prompt/model
  version, latency, provider usage and a sanitized error).

Additive and safe: no existing rows are touched. Rollback drops only these two
new tables and never removes documents or numbering records.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "d4e5f6a7b8c9"
down_revision = "3e4a5b6c7d8e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ai_configs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("provider", sa.String(50), nullable=False, server_default="deepseek"),
        sa.Column("model", sa.String(100), nullable=False, server_default="deepseek-v4-flash"),
        sa.Column("api_key_ciphertext", sa.Text(), nullable=True),
        sa.Column("api_key_masked", sa.String(16), nullable=True),
        sa.Column("timeout_seconds", sa.Integer(), nullable=False, server_default="60"),
        sa.Column("max_tokens", sa.Integer(), nullable=False, server_default="4096"),
        sa.Column("max_concurrency", sa.Integer(), nullable=False, server_default="4"),
        sa.Column("monthly_token_limit", sa.Integer(), nullable=True),
        sa.Column("secret_ref", sa.String(255), nullable=True),
        sa.Column("last_test_status", sa.String(30), nullable=True),
        sa.Column("last_test_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_test_message", sa.Text(), nullable=True),
        sa.Column("last_test_latency_ms", sa.Integer(), nullable=True),
        sa.Column("usage_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint("organization_id", name="uq_ai_configs_organization_id"),
    )
    op.create_index("ix_ai_configs_organization_id", "ai_configs", ["organization_id"])

    op.create_table(
        "ai_executions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("kind", sa.String(40), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("model", sa.String(100), nullable=False),
        sa.Column("prompt_version", sa.String(50), nullable=True),
        sa.Column("idempotency_key", sa.String(120), nullable=True),
        sa.Column("request_meta", JSONB(), nullable=True),
        sa.Column("usage", JSONB(), nullable=True),
        sa.Column("error", JSONB(), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_ai_executions_org_kind_status",
        "ai_executions",
        ["organization_id", "kind", "status"],
    )
    op.create_index(
        "ix_ai_executions_idempotency",
        "ai_executions",
        ["organization_id", "idempotency_key"],
    )


def downgrade() -> None:
    op.drop_index("ix_ai_executions_idempotency", table_name="ai_executions")
    op.drop_index("ix_ai_executions_org_kind_status", table_name="ai_executions")
    op.drop_table("ai_executions")
    op.drop_index("ix_ai_configs_organization_id", table_name="ai_configs")
    op.drop_table("ai_configs")
