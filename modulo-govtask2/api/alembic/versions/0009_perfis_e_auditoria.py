"""Perfil do GovTask por usuário, setores configuráveis e auditoria.

Revision ID: 0009_perfis_auditoria
Revises: 0008_conversa_ficha
Create Date: 2026-09-23
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0009_perfis_auditoria"
down_revision = "0008_conversa_ficha"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("perfil_govtask", sa.String(20), nullable=True))
    op.add_column(
        "users",
        sa.Column("ativo_govtask", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.add_column("users", sa.Column("ultimo_acesso", sa.DateTime(timezone=True), nullable=True))

    op.add_column("setores", sa.Column("prazo_dias", sa.Integer(), nullable=True))
    op.add_column(
        "setores",
        sa.Column(
            "responsavel_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )

    op.add_column("ajustes", sa.Column("resumo_hora", sa.Integer(), nullable=False, server_default="7"))
    op.add_column(
        "ajustes",
        sa.Column("resumo_perfis", postgresql.JSONB(), nullable=False, server_default='["PREFEITO"]'),
    )

    op.create_table(
        "auditoria_config",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "autor_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("autor_nome", sa.String(180), nullable=False, server_default=""),
        sa.Column("alvo_tipo", sa.String(20), nullable=False),
        sa.Column("alvo_nome", sa.String(255), nullable=False, server_default=""),
        sa.Column("campo", sa.String(40), nullable=False),
        sa.Column("antes", sa.String(255), nullable=True),
        sa.Column("depois", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_auditoria_org_data", "auditoria_config", ["organization_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_auditoria_org_data", "auditoria_config")
    op.drop_table("auditoria_config")
    op.drop_column("ajustes", "resumo_perfis")
    op.drop_column("ajustes", "resumo_hora")
    op.drop_column("setores", "responsavel_id")
    op.drop_column("setores", "prazo_dias")
    op.drop_column("users", "ultimo_acesso")
    op.drop_column("users", "ativo_govtask")
    op.drop_column("users", "perfil_govtask")
