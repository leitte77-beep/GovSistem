"""Portal do posto: acessos do fornecedor e autoria do posto no fechamento.

Revision ID: 015
Revises: 014
Create Date: 2026-09-29
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "015"
down_revision: Union[str, None] = "014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "acessos_fornecedor",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("fornecedor_id", sa.Uuid(), nullable=False),
        sa.Column("nome", sa.String(150), nullable=False),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("login", sa.String(60), nullable=False),
        sa.Column("login_normalized", sa.String(60), nullable=False),
        sa.Column("senha_hash", sa.String(255), nullable=False),
        sa.Column("deve_trocar_senha", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("bloqueado", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("falhas_login", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ultimo_acesso", sa.DateTime(timezone=True), nullable=True),
        sa.Column("credential_version", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("criado_por_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["fornecedor_id"], ["fornecedores.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("login_normalized", name="uq_acessos_fornecedor_login"),
        sa.CheckConstraint("login_normalized = lower(login)", name="ck_acesso_fornecedor_login_normalizado"),
    )
    op.create_index("ix_acessos_fornecedor_organization_id", "acessos_fornecedor", ["organization_id"])
    op.create_index("ix_acessos_fornecedor_fornecedor_id", "acessos_fornecedor", ["fornecedor_id"])
    op.add_column("fechamento_eventos", sa.Column("acesso_fornecedor_id", sa.Uuid(), nullable=True))
    op.add_column("fechamentos", sa.Column("criado_por_acesso_fornecedor_id", sa.Uuid(), nullable=True))
    op.add_column("fechamento_documentos", sa.Column("enviado_por_acesso_fornecedor_id", sa.Uuid(), nullable=True))


def downgrade() -> None:
    op.drop_column("fechamento_documentos", "enviado_por_acesso_fornecedor_id")
    op.drop_column("fechamentos", "criado_por_acesso_fornecedor_id")
    op.drop_column("fechamento_eventos", "acesso_fornecedor_id")
    op.drop_table("acessos_fornecedor")
