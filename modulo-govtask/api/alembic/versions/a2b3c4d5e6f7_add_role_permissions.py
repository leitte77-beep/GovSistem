"""Add role_permissions (RBAC granular)

Revision ID: a2b3c4d5e6f7
Revises: a1b2c3d4e5f6
Create Date: 2026-08-19 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "a2b3c4d5e6f7"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Permissões padrão por role (alinhadas ao mapa em app/core/permissions.py)
ROLE_DEFAULT_PERMISSIONS = {
    "ADMIN": [
        "resource.view", "resource.create", "resource.edit", "resource.delete",
        "task.assign", "task.approve", "financial.view", "financial.manage",
        "engineering.manage", "accountability.manage", "licitacao.manage",
        "export", "audit.view", "admin.config",
    ],
    "ASSESSOR": [
        "resource.view", "resource.create", "resource.edit", "resource.delete",
        "task.assign", "task.approve", "financial.view", "financial.manage",
        "engineering.manage", "accountability.manage", "licitacao.manage",
        "export", "audit.view",
    ],
    "ENGENHEIRO_TECNICO": [
        "resource.view", "engineering.manage", "export",
    ],
    "COMPRAS_LICITACAO": [
        "resource.view", "licitacao.manage", "task.assign", "export",
    ],
    "GESTOR": [
        "resource.view", "financial.view", "export",
    ],
}


def upgrade() -> None:
    op.create_table(
        "role_permissions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("role_id", UUID(as_uuid=True), sa.ForeignKey("roles.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("permission", sa.String(100), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("role_id", "permission", name="uq_role_permission"),
    )

    for role_name, perms in ROLE_DEFAULT_PERMISSIONS.items():
        op.execute(
            sa.text(
                """
                INSERT INTO role_permissions (id, role_id, permission)
                SELECT gen_random_uuid(), r.id, p.permission
                FROM roles r
                CROSS JOIN unnest(CAST(:perms AS VARCHAR[])) AS p(permission)
                WHERE r.name = :role_name
                """
            ).bindparams(
                role_name=role_name,
                perms=list(perms),
            )
        )


def downgrade() -> None:
    op.drop_table("role_permissions")
