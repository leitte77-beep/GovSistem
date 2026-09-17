"""Notificações multicanal: preferências de canal por usuário (§41).

Migração aditiva. O canal in-app continua sendo gravado sempre; a tabela guarda
apenas a opção do usuário de receber também por e-mail e para quais tipos.

Revision ID: f0a1b2c3d4e5
Revises: f9a0b1c2d3e4
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "f0a1b2c3d4e5"
down_revision = "f9a0b1c2d3e4"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.create_table(
        "notificacao_preferencias",
        sa.Column("id", UUID, primary_key=True),
        sa.Column(
            "user_id",
            UUID,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "email_ativo",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        sa.Column(
            "tipos_email",
            sa.JSON(),
            nullable=False,
            server_default="[]",
            comment="Tipos que geram e-mail; vazio = todos os tipos",
        ),
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
        sa.UniqueConstraint("user_id", name="uq_notificacao_preferencia_user"),
    )


def downgrade() -> None:
    op.drop_table("notificacao_preferencias")
