"""add multi-tenant memberships and per-membership grants

Revision ID: mt0001_add_memberships
Revises: k2l3m4n5o6p7
Create Date: 2026-08-27

NOTA DE OPERAÇÃO:
- O head real do banco é `govpro01` (aplicado em produção; arquivo desta migration
  não existe no branch atual). O down_revision desta migration aponta para `govpro01`.
- O histórico possui MÚLTIPLOS HEADS (ex.: govsocial01). Aplicar com alvo explícito:
    alembic upgrade mt0001_add_memberships
- Migration ADITIVA e idempotente. Não remove nada.
- Executar apenas após gerar e validar o dump (ver backfar/<id>/banco/).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "mt0001_add_memberships"
down_revision: Union[str, Sequence[str], None] = "govpro01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- organization_memberships -----------------------------------------
    op.create_table(
        "organization_memberships",
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
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("membership_role", sa.String(50), nullable=False, server_default="ORG_MEMBER"),
        sa.Column("status", sa.String(50), nullable=False, server_default="active"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_by", UUID(as_uuid=True), nullable=True),
        sa.Column("updated_by", UUID(as_uuid=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "uq_org_membership_org_user",
        "organization_memberships",
        ["organization_id", "user_id"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index("ix_org_memberships_org", "organization_memberships", ["organization_id"])
    op.create_index("ix_org_memberships_user", "organization_memberships", ["user_id"])
    op.create_index(
        "ix_org_memberships_org_status", "organization_memberships", ["organization_id", "status"]
    )

    # --- membership_module_grants -----------------------------------------
    op.create_table(
        "membership_module_grants",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "membership_id",
            UUID(as_uuid=True),
            sa.ForeignKey("organization_memberships.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("module_slug", sa.String(50), nullable=False),
        sa.Column("role_name", sa.String(50), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("source", sa.String(30), nullable=False, server_default="SYSTEM"),
        sa.Column("requires_review", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_by", UUID(as_uuid=True), nullable=True),
        sa.Column("updated_by", UUID(as_uuid=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "uq_membership_grant_module_role",
        "membership_module_grants",
        ["membership_id", "module_slug", "role_name"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index(
        "ix_membership_grants_membership", "membership_module_grants", ["membership_id"]
    )
    op.create_index("ix_membership_grants_module", "membership_module_grants", ["module_slug"])

    # --- modules: campos aditivos de URL (opcionais) ----------------------
    # Precedência de resolução em código: *_MODULE_ADMIN_URL (.env) >
    # modules.admin_url (banco) > modules.base_url. A separação explícita
    # permite manter aliases antigos (diario/doe-admin, govpro/proc).
    op.add_column("modules", sa.Column("app_url", sa.String(500), nullable=True))
    op.add_column("modules", sa.Column("sso_callback_url", sa.String(500), nullable=True))
    op.add_column("modules", sa.Column("logout_callback_url", sa.String(500), nullable=True))
    op.add_column("modules", sa.Column("healthcheck_url", sa.String(500), nullable=True))


def downgrade() -> None:
    op.drop_column("modules", "healthcheck_url")
    op.drop_column("modules", "logout_callback_url")
    op.drop_column("modules", "sso_callback_url")
    op.drop_column("modules", "app_url")
    op.drop_index("ix_membership_grants_module", table_name="membership_module_grants")
    op.drop_index("ix_membership_grants_membership", table_name="membership_module_grants")
    op.drop_index("uq_membership_grant_module_role", table_name="membership_module_grants")
    op.drop_table("membership_module_grants")
    op.drop_index("ix_org_memberships_org_status", table_name="organization_memberships")
    op.drop_index("ix_org_memberships_user", table_name="organization_memberships")
    op.drop_index("ix_org_memberships_org", table_name="organization_memberships")
    op.drop_index("uq_org_membership_org_user", table_name="organization_memberships")
    op.drop_table("organization_memberships")
