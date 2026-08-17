"""regras automáticas de encaminhamento

Revision ID: 0004_regras_encaminhamento
Revises: 0003_matriz_assinatura
Create Date: 2026-08-13
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "0004_regras_encaminhamento"
down_revision = "0003_matriz_assinatura"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "regras_encaminhamento" in inspector.get_table_names():
        return

    op.create_table(
        "regras_encaminhamento",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("tenant_id", UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("nome", sa.String(200), nullable=False),
        sa.Column(
            "tipo_processo_id",
            UUID(as_uuid=True),
            sa.ForeignKey("tipos_processo.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("condicoes", sa.JSON(), nullable=False),
        sa.Column(
            "unidade_destino_id",
            UUID(as_uuid=True),
            sa.ForeignKey("unidades.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("prioridade", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("ativa", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("observacao", sa.Text(), nullable=True),
    )
    op.create_index(
        "ix_regras_enc_tenant_ativa", "regras_encaminhamento", ["tenant_id", "ativa"]
    )
    op.create_index(
        "ix_regras_enc_tenant_tipo", "regras_encaminhamento", ["tenant_id", "tipo_processo_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_regras_enc_tenant_tipo", table_name="regras_encaminhamento")
    op.drop_index("ix_regras_enc_tenant_ativa", table_name="regras_encaminhamento")
    op.drop_table("regras_encaminhamento")
