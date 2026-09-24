"""add membership profile fields (position, department)

Revision ID: mt0002_add_membership_profile_fields
Revises: mt0001_add_memberships
Create Date: 2026-08-27

Migration ADITIVA e idempotente. Adiciona campos de perfil (cargo e
departamento) na organization_memberships para o CRUD do portal do tenant.
Não altera, não remove e não recria nada.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "mt0002"
down_revision: Union[str, Sequence[str], None] = "mt0001_add_memberships"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    cols = {c["name"] for c in insp.get_columns("organization_memberships")}

    if "position" not in cols:
        op.add_column("organization_memberships", sa.Column("position", sa.String(120), nullable=True))
    if "department" not in cols:
        op.add_column("organization_memberships", sa.Column("department", sa.String(120), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    cols = {c["name"] for c in insp.get_columns("organization_memberships")}

    if "department" in cols:
        op.drop_column("organization_memberships", "department")
    if "position" in cols:
        op.drop_column("organization_memberships", "position")
