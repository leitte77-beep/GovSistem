"""identity and audit foundation

Revision ID: 0001_identity_foundation
Revises:
Create Date: 2026-09-09
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001_identity_foundation"
down_revision = None
branch_labels = None
depends_on = None


def stamp_columns() -> list[sa.Column]:
    return [
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    ]


def upgrade() -> None:
    organization_type = sa.Enum("MUNICIPALITY", "STATE", "CONSORTIUM", "AUTARCHY", "FOUNDATION", "OTHER", name="organization_type")
    op.create_table("organizations", sa.Column("type", organization_type, nullable=False), sa.Column("name", sa.String(160), nullable=False), sa.Column("legal_name", sa.String(255), nullable=False), sa.Column("cnpj", sa.String(14), nullable=False), sa.Column("ibge_code", sa.String(7)), sa.Column("state", sa.String(2), nullable=False), sa.Column("city", sa.String(120), nullable=False), sa.Column("slug", sa.String(80), nullable=False), sa.Column("timezone", sa.String(64), nullable=False), sa.Column("active", sa.Boolean(), nullable=False), *stamp_columns(), sa.UniqueConstraint("cnpj"), sa.UniqueConstraint("slug"))
    op.create_table("users", sa.Column("email", sa.String(254), nullable=False), sa.Column("password_hash", sa.String(255), nullable=False), sa.Column("display_name", sa.String(160), nullable=False), sa.Column("active", sa.Boolean(), nullable=False), sa.Column("email_verified", sa.Boolean(), nullable=False), *stamp_columns(), sa.UniqueConstraint("email"))
    op.create_table("roles", sa.Column("key", sa.String(80), nullable=False), sa.Column("name", sa.String(120), nullable=False), sa.Column("system", sa.Boolean(), nullable=False), *stamp_columns(), sa.UniqueConstraint("key"))
    op.create_table("permissions", sa.Column("key", sa.String(120), nullable=False), sa.Column("description", sa.String(255), nullable=False), *stamp_columns(), sa.UniqueConstraint("key"))
    op.create_table("memberships", sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False), sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False), sa.Column("active", sa.Boolean(), nullable=False), *stamp_columns(), sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="RESTRICT"), sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="RESTRICT"), sa.UniqueConstraint("organization_id", "user_id", name="membership_org_user"))
    op.create_index("ix_memberships_organization_id", "memberships", ["organization_id"])
    op.create_index("ix_memberships_user_id", "memberships", ["user_id"])
    op.create_table("membership_roles", sa.Column("membership_id", postgresql.UUID(as_uuid=True), nullable=False), sa.Column("role_id", postgresql.UUID(as_uuid=True), nullable=False), sa.ForeignKeyConstraint(["membership_id"], ["memberships.id"], ondelete="CASCADE"), sa.ForeignKeyConstraint(["role_id"], ["roles.id"], ondelete="CASCADE"), sa.PrimaryKeyConstraint("membership_id", "role_id"))
    op.create_table("role_permissions", sa.Column("role_id", postgresql.UUID(as_uuid=True), nullable=False), sa.Column("permission_id", postgresql.UUID(as_uuid=True), nullable=False), sa.ForeignKeyConstraint(["role_id"], ["roles.id"], ondelete="CASCADE"), sa.ForeignKeyConstraint(["permission_id"], ["permissions.id"], ondelete="CASCADE"), sa.PrimaryKeyConstraint("role_id", "permission_id"))
    op.create_table("audit_events", sa.Column("organization_id", postgresql.UUID(as_uuid=True)), sa.Column("actor_id", postgresql.UUID(as_uuid=True)), sa.Column("action", sa.String(120), nullable=False), sa.Column("entity", sa.String(120), nullable=False), sa.Column("entity_id", sa.String(64)), sa.Column("before", sa.JSON()), sa.Column("after", sa.JSON()), sa.Column("correlation_id", sa.String(64), nullable=False), sa.Column("ip", sa.String(64)), sa.Column("user_agent", sa.String(512)), *stamp_columns(), sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="RESTRICT"), sa.ForeignKeyConstraint(["actor_id"], ["users.id"], ondelete="SET NULL"))
    op.create_index("ix_audit_events_organization_id", "audit_events", ["organization_id"])
    op.create_index("ix_audit_events_correlation_id", "audit_events", ["correlation_id"])


def downgrade() -> None:
    for table in ("audit_events", "role_permissions", "membership_roles", "memberships", "permissions", "roles", "users", "organizations"):
        op.drop_table(table)
