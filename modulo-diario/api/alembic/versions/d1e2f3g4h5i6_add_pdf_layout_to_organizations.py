"""add pdf_layout to organizations

Revision ID: d1e2f3g4h5i6
Revises: c1d2e3f4a5b6
Create Date: 2026-06-17
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d1e2f3g4h5i6"
down_revision: Union[str, None] = "c1d2e3f4a5b6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "organizations",
        sa.Column(
            "pdf_layout",
            sa.String(20),
            nullable=False,
            server_default="classico",
            comment="PDF layout template: classico, moderno, minimalista",
        ),
    )


def downgrade() -> None:
    op.drop_column("organizations", "pdf_layout")
