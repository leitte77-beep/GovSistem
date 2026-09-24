"""add_user_module_grants

Revision ID: e7f8a9b0c1d2
Revises: d6e7f8a9b0c1
Create Date: 2026-06-02 12:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = 'e7f8a9b0c1d2'
down_revision: Union[str, None] = 'd6e7f8a9b0c1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "user_module_grants",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("module_slug", sa.String(length=50), nullable=False),
        sa.Column("role_name", sa.String(length=50), nullable=False),
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
        sa.UniqueConstraint(
            "user_id", "module_slug", "role_name", name="uq_user_module_role"
        ),
    )
    op.create_index(
        "ix_user_module_grants_user_id", "user_module_grants", ["user_id"]
    )
    op.create_index(
        "ix_user_module_grants_module_slug", "user_module_grants", ["module_slug"]
    )

    # Backfill: existing module_permissions JSON ({"modules": [...]}) gave a user
    # access to a module. Grant them the baseline "author/user" role per module
    # so nobody loses access during the transition.
    op.execute(
        """
        INSERT INTO user_module_grants (id, user_id, module_slug, role_name, created_at, updated_at)
        SELECT gen_random_uuid(), u.id, m.slug,
               CASE m.slug
                   WHEN 'diario' THEN 'AUTOR'
                   WHEN 'chatgov' THEN 'CHATGOV_USER'
                   WHEN 'financeiro' THEN 'FINANCEIRO_VIEWER'
                   ELSE 'AUTOR'
               END,
               now(), now()
        FROM users u
        CROSS JOIN LATERAL jsonb_array_elements_text(
            COALESCE((u.module_permissions::jsonb)->'modules', '[]'::jsonb)
        ) AS m(slug)
        WHERE u.module_permissions IS NOT NULL
        ON CONFLICT ON CONSTRAINT uq_user_module_role DO NOTHING;
        """
    )


def downgrade() -> None:
    op.drop_index("ix_user_module_grants_module_slug", table_name="user_module_grants")
    op.drop_index("ix_user_module_grants_user_id", table_name="user_module_grants")
    op.drop_table("user_module_grants")
