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

# The `editions.status` column is a VARCHAR(20), not a Postgres enum. This
# migration historically issued `ALTER TYPE editionstatus ...` against a type
# that was never created by any migration in the chain, which made a clean
# install (alembic upgrade head on an empty DB) fail with
# `type "editionstatus" does not exist`. Guard the statement so it is a no-op
# when the enum type is absent, and still extends the type when it exists
# (e.g. databases that created it out-of-band).

_ADD_VALUE_SQL = (
    "ALTER TYPE editionstatus ADD VALUE IF NOT EXISTS '%s'"
)


def _enum_type_exists(conn) -> bool:
    result = conn.exec_driver_sql(
        "SELECT 1 FROM pg_type WHERE typname = 'editionstatus'"
    )
    return result.first() is not None


def upgrade() -> None:
    conn = op.get_bind()
    if not _enum_type_exists(conn):
        return
    op.execute(_ADD_VALUE_SQL % "PDF_GENERATED")
    op.execute(_ADD_VALUE_SQL % "SIGNED")


def downgrade() -> None:
    # Value removal is not supported by Postgres ALTER TYPE; nothing to undo.
    pass
