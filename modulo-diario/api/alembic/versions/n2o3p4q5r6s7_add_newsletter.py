"""boletim por e-mail: inscritos e envios por edição

Revision ID: n2o3p4q5r6s7
Revises: m1n2o3p4q5r6
Create Date: 2026-10-20
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "n2o3p4q5r6s7"
down_revision = "m1n2o3p4q5r6"
branch_labels = None
depends_on = None


def _ts():
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    ]


def upgrade() -> None:
    op.create_table(
        "newsletter_subscribers",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("token", sa.String(64), nullable=False),
        sa.Column("confirmation_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("unsubscribed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("consent_ip", sa.String(64), nullable=True),
        *_ts(),
        sa.UniqueConstraint("organization_id", "email", name="uq_newsletter_org_email"),
    )
    op.create_index("ix_newsletter_subscribers_organization_id", "newsletter_subscribers", ["organization_id"])
    op.create_index("ix_newsletter_subscribers_token", "newsletter_subscribers", ["token"], unique=True)

    op.create_table(
        "newsletter_dispatches",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("edition_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("editions.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("recipients", sa.Integer, nullable=False, server_default="0"),
        sa.Column("sent", sa.Integer, nullable=False, server_default="0"),
        sa.Column("failed", sa.Integer, nullable=False, server_default="0"),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        *_ts(),
    )
    op.create_index("ix_newsletter_dispatches_organization_id", "newsletter_dispatches", ["organization_id"])


def downgrade() -> None:
    op.drop_table("newsletter_dispatches")
    op.drop_table("newsletter_subscribers")
