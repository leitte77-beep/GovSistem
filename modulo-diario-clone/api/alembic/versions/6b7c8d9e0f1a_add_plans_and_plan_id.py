"""add plans table and plan_id to organizations

Revision ID: 6b7c8d9e0f1a
Revises: 5a6b7c8d9e0f
Create Date: 2026-05-21 23:30:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = '6b7c8d9e0f1a'
down_revision: Union[str, None] = '5a6b7c8d9e0f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "plans",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("slug", sa.String(50), unique=True, nullable=False, index=True),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("max_users", sa.Integer, default=5, nullable=False),
        sa.Column("max_editions_per_month", sa.Integer, default=10, nullable=False),
        sa.Column("max_storage_mb", sa.Integer, default=500, nullable=False),
        sa.Column("has_custom_domain", sa.Boolean, default=False, nullable=False),
        sa.Column("has_white_label", sa.Boolean, default=False, nullable=False),
        sa.Column("price_cents", sa.Integer, default=0, nullable=False,
                  comment="Price in cents (R$). 0 = free."),
        sa.Column("is_active", sa.Boolean, default=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
    )

    # Seed default plans
    op.execute("""
        INSERT INTO plans (id, name, slug, description, max_users,
                           max_editions_per_month, max_storage_mb,
                           has_custom_domain, has_white_label, price_cents, is_active)
        VALUES
          (gen_random_uuid(), 'Gratuito', 'free',
           'Plano gratuito para pequenos órgãos públicos',
           3, 5, 200, false, false, 0, true),
          (gen_random_uuid(), 'Básico', 'basic',
           'Plano básico para prefeituras de pequeno porte',
           10, 20, 1000, false, false, 9900, true),
          (gen_random_uuid(), 'Profissional', 'pro',
           'Plano profissional com domínio personalizado',
           50, 100, 5000, true, false, 29900, true),
          (gen_random_uuid(), 'Enterprise', 'enterprise',
           'Plano completo com white label e suporte prioritário',
           -1, -1, -1, true, true, 99900, true)
    """)

    op.add_column(
        "organizations",
        sa.Column("plan_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("plans.id", ondelete="SET NULL"),
                  nullable=True, index=True),
    )

    # Assign free plan to existing organizations
    op.execute("""
        UPDATE organizations
        SET plan_id = (SELECT id FROM plans WHERE slug = 'free')
        WHERE plan_id IS NULL
    """)


def downgrade() -> None:
    op.drop_column("organizations", "plan_id")
    op.drop_table("plans")
