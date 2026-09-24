"""add_pades_hashes_to_editions

Additive migration for real PAdES signing support:
source/signed/manifest hashes, signature validation results and renderer version.

Revision ID: 9a8b7c6d5e4f
Revises: b2c3d4e5f6a7
Create Date: 2026-09-01
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '9a8b7c6d5e4f'
down_revision: Union[str, None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("editions", sa.Column("source_pdf_hash", sa.String(64), nullable=True,
                  comment="SHA-256 of the immutable unsigned PDF sent to the signer"))
    op.add_column("editions", sa.Column("signed_pdf_hash", sa.String(64), nullable=True,
                  comment="SHA-256 of the final signed PDF stored in storage"))
    op.add_column("editions", sa.Column("content_manifest_hash", sa.String(64), nullable=True,
                  comment="SHA-256 over canonical content manifest"))
    op.add_column("editions", sa.Column("signature_validation_status", sa.String(50), nullable=True,
                  comment="PAdES validation result: valid | invalid | not_validated"))
    op.add_column("editions", sa.Column("signature_validation_details", sa.JSON(), nullable=True,
                  comment="Detailed PAdES validation report"))
    op.add_column("editions", sa.Column("renderer_version", sa.String(50), nullable=True,
                  comment="Version of the PDF renderer"))
    op.add_column("editions", sa.Column("layout_version", sa.String(50), nullable=True,
                  comment="Version of the template layout"))


def downgrade() -> None:
    for col in ("layout_version", "renderer_version", "signature_validation_details",
                "signature_validation_status", "content_manifest_hash",
                "signed_pdf_hash", "source_pdf_hash"):
        op.drop_column("editions", col)
