"""add theme_config and public_url to organizations

Revision ID: 5a6b7c8d9e0f
Revises: 4ed27b7a7ed6
Create Date: 2026-05-21 23:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = '5a6b7c8d9e0f'
down_revision: Union[str, None] = '4ed27b7a7ed6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "organizations",
        sa.Column("theme_config", postgresql.JSON, nullable=True,
                  comment="Theme customization: primary_color, secondary_color, font_family, etc."),
    )
    op.add_column(
        "organizations",
        sa.Column("public_url", sa.String(255), nullable=True,
                  comment="Default public portal URL for this organization"),
    )


def downgrade() -> None:
    op.drop_column("organizations", "public_url")
    op.drop_column("organizations", "theme_config")
