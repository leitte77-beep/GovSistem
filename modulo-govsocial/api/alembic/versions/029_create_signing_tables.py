"""Create signing_credentials and documentos_assinaturas (Fase 3.13)

Revision ID: 029
Revises: 028
Create Date: 2026-07-14
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "029"
down_revision: Union[str, None] = "028"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table("signing_credentials",
        sa.Column("id", sa.UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", sa.String(36), nullable=False, index=True),
        sa.Column("label", sa.String(100), nullable=False),
        sa.Column("tipo", sa.String(10), nullable=False, server_default="A1"),
        sa.Column("pfx_enc", sa.Text(), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("subject", sa.String(200), nullable=True),
        sa.Column("serial_number", sa.String(100), nullable=True),
        sa.Column("issuer", sa.String(200), nullable=True),
        sa.Column("valid_from", sa.DateTime(), nullable=True),
        sa.Column("valid_to", sa.DateTime(), nullable=True),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_table("documentos_assinaturas",
        sa.Column("id", sa.UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", sa.String(36), nullable=False, index=True),
        sa.Column("documento_tipo", sa.String(50), nullable=False),
        sa.Column("documento_id", sa.UUID(), nullable=True),
        sa.Column("pdf_signed_base64", sa.Text(), nullable=False),
        sa.Column("sha256_signed", sa.String(64), nullable=True),
        sa.Column("sha256_original", sa.String(64), nullable=True),
        sa.Column("certificate_subject", sa.String(200), nullable=True),
        sa.Column("certificate_serial", sa.String(100), nullable=True),
        sa.Column("verification_code", sa.String(12), nullable=True),
        sa.Column("signature_format", sa.String(20), nullable=False, server_default="PAdES-AD-RB"),
        sa.Column("signed_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("registrado_por_id", sa.UUID(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )


def downgrade() -> None:
    op.drop_table("documentos_assinaturas")
    op.drop_table("signing_credentials")
