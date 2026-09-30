"""Perfil local do usuário e escopo por secretaria.

`usuario_acessos` guarda o perfil definido no GovFrota (o SSO recria
`user_roles` a cada sincronização). `usuario_unidades` restringe o usuário às
secretarias vinculadas — aplicado no backend.

Revision ID: 010
Revises: 009
Create Date: 2026-09-29
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "010"
down_revision: Union[str, None] = "009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _timestamps():
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    ]


def upgrade() -> None:
    op.create_table(
        "usuario_acessos",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("perfil", sa.String(50), nullable=True),
        sa.Column("cargo", sa.String(150), nullable=True),
        sa.Column("atualizado_por_id", sa.Uuid(), nullable=True),
        *_timestamps(),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", name="uq_usuario_acessos_user"),
    )
    op.create_index("ix_usuario_acessos_organization_id", "usuario_acessos", ["organization_id"])

    op.create_table(
        "usuario_unidades",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("unidade_id", sa.Uuid(), nullable=False),
        *_timestamps(),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["unidade_id"], ["unidades.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "unidade_id", name="uq_usuario_unidade"),
    )
    op.create_index("ix_usuario_unidades_organization_id", "usuario_unidades", ["organization_id"])
    op.create_index("ix_usuario_unidades_user_id", "usuario_unidades", ["user_id"])


def downgrade() -> None:
    op.drop_table("usuario_unidades")
    op.drop_table("usuario_acessos")
