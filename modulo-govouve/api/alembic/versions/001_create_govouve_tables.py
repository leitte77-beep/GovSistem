"""Initial migration: organizations, users, roles, user_roles, refresh_tokens, secretarias

Revision ID: 001
Revises:
Create Date: 2026-06-08
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "organizations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(100), unique=True, nullable=False, index=True),
        sa.Column("cnpj", sa.String(18), unique=True, nullable=True),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("logo_url", sa.String(500), nullable=True),
        sa.Column("theme_config", sa.JSON, nullable=True),
        sa.Column("public_url", sa.String(255), nullable=True),
        sa.Column("is_active", sa.Boolean, default=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "users",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("email", sa.String(255), unique=True, nullable=False, index=True),
        sa.Column("password_hash", sa.String(255), nullable=True),
        sa.Column("is_active", sa.Boolean, default=True, nullable=False),
        sa.Column("mfa_secret", sa.Text, nullable=True),
        sa.Column("mfa_enabled", sa.Boolean, default=False, nullable=False),
        sa.Column("password_changed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("password_failures", sa.Integer, default=0, nullable=False),
        sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "roles",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(50), unique=True, nullable=False, index=True),
        sa.Column("label", sa.String(100), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("is_system", sa.Boolean, default=False, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "user_roles",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role_id", UUID(as_uuid=True), sa.ForeignKey("roles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("user_id", "role_id", name="uq_user_role"),
    )

    op.create_table(
        "refresh_tokens",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "secretarias",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("slug", sa.String(100), nullable=False, index=True),
        sa.Column("nome", sa.String(255), nullable=False),
        sa.Column("cnpj", sa.String(18), nullable=True),
        sa.Column("ativo", sa.Boolean, default=True, nullable=False),
        sa.Column("config", sa.JSON, nullable=True),
        sa.Column("ouvidor_responsavel", sa.String(255), nullable=True),
        sa.Column("descricao", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.execute("""
        INSERT INTO roles (id, name, label, description, is_system, created_at, updated_at)
        VALUES
            (gen_random_uuid(), 'ADMIN', 'Administrador', 'Acesso total ao GovOuve', true, now(), now()),
            (gen_random_uuid(), 'ATENDENTE', 'Atendente', 'Tria, analisa e responde manifestações', true, now(), now()),
            (gen_random_uuid(), 'GESTOR_SECRETARIA', 'Gestor de Secretaria', 'Gerencia avaliações, formulários e indicadores da secretaria', true, now(), now()),
            (gen_random_uuid(), 'OUVIDOR_GERAL', 'Ouvidor-Geral', 'Visão consolidada de todas as secretarias, redistribuição e relatórios globais', true, now(), now())
        ON CONFLICT (name) DO NOTHING;
    """)


def downgrade() -> None:
    op.drop_table("secretarias")
    op.drop_table("refresh_tokens")
    op.drop_table("user_roles")
    op.drop_table("roles")
    op.drop_table("users")
    op.drop_table("organizations")
