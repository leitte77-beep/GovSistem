"""atribuição pessoal (responsavel_id) e visualização por usuário — Minha Caixa

Revision ID: 0005_minha_caixa
Revises: 0004_regras_encaminhamento
Create Date: 2026-08-14
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "0005_minha_caixa"
down_revision = "0004_regras_encaminhamento"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    colunas_processos = {c["name"] for c in inspector.get_columns("processos")}
    if "responsavel_id" not in colunas_processos:
        op.add_column(
            "processos",
            sa.Column(
                "responsavel_id",
                UUID(as_uuid=True),
                sa.ForeignKey("users.id", ondelete="SET NULL"),
                nullable=True,
            ),
        )

    if "processos_visualizacoes" not in inspector.get_table_names():
        op.create_table(
            "processos_visualizacoes",
            sa.Column("id", UUID(as_uuid=True), primary_key=True),
            sa.Column("tenant_id", UUID(as_uuid=True), nullable=False, index=True),
            sa.Column(
                "processo_id",
                UUID(as_uuid=True),
                sa.ForeignKey("processos.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "user_id",
                UUID(as_uuid=True),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("visualizado_em", sa.DateTime(), nullable=False),
            sa.UniqueConstraint("processo_id", "user_id", name="uq_processo_visualizacao"),
        )
        op.create_index(
            "ix_processo_visualizacao_tenant_user",
            "processos_visualizacoes",
            ["tenant_id", "user_id"],
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "processos_visualizacoes" in inspector.get_table_names():
        op.drop_table("processos_visualizacoes")
    colunas_processos = {c["name"] for c in inspector.get_columns("processos")}
    if "responsavel_id" in colunas_processos:
        op.drop_column("processos", "responsavel_id")
