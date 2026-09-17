"""Outbox de envio de e-mail (§41, §126).

Migração aditiva. O envio externo passa a ser enfileirado e entregue por um
processador com retentativa, em vez de sair no meio da operação.

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "c3d4e5f6a7b8"
down_revision = "b2c3d4e5f6a7"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.create_table(
        "notificacao_envios",
        sa.Column("id", UUID, primary_key=True),
        sa.Column(
            "organization_id",
            UUID,
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "notificacao_id",
            UUID,
            sa.ForeignKey("notificacoes.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("canal", sa.String(10), nullable=False, server_default="EMAIL"),
        sa.Column("destinatario", sa.String(255), nullable=False),
        sa.Column("assunto", sa.String(255), nullable=False),
        sa.Column("corpo", sa.Text(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="PENDENTE"),
        sa.Column("tentativas", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("ultimo_erro", sa.Text(), nullable=True),
        sa.Column("agendado_para", sa.DateTime(timezone=True), nullable=False),
        sa.Column("enviado_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("notificacao_id", "canal", name="uq_notificacao_envio_canal"),
    )
    op.create_index("ix_notificacao_envios_organization_id", "notificacao_envios", ["organization_id"])
    op.create_index("ix_notificacao_envios_notificacao_id", "notificacao_envios", ["notificacao_id"])
    op.create_index("ix_notificacao_envios_status", "notificacao_envios", ["status"])
    op.create_index("ix_notificacao_envios_agendado_para", "notificacao_envios", ["agendado_para"])


def downgrade() -> None:
    op.drop_index("ix_notificacao_envios_agendado_para", table_name="notificacao_envios")
    op.drop_index("ix_notificacao_envios_status", table_name="notificacao_envios")
    op.drop_index("ix_notificacao_envios_notificacao_id", table_name="notificacao_envios")
    op.drop_index("ix_notificacao_envios_organization_id", table_name="notificacao_envios")
    op.drop_table("notificacao_envios")
