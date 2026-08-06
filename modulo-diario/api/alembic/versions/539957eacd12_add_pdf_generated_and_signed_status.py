"""add_pdf_generated_and_signed_status

Revision ID: 539957eacd12
Revises: 258eddc9cfcd
Create Date: 2026-05-15 17:01:47.549352
"""
from typing import Sequence, Union

from alembic import op

revision: str = '539957eacd12'
down_revision: Union[str, None] = '258eddc9cfcd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE editionstatus ADD VALUE IF NOT EXISTS 'PDF_GENERATED'")
    op.execute("ALTER TYPE editionstatus ADD VALUE IF NOT EXISTS 'SIGNED'")


def downgrade() -> None:
    pass
