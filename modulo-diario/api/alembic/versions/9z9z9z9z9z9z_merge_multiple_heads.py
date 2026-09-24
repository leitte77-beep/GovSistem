"""merge multiple heads into a single linear history

The project accumulated three independent migration branches (plans,
semantic document engine, missing indexes) because schema bootstrap was
previously done by an in-process DDL idempotent routine instead of
Alembic. After stamping the existing database with the three heads,
this merge revision unifies them so Alembic can be the single source of
truth for schema authority going forward.

No DDL is performed; this migration only collapses history.

Revision ID: 9z9z9z9z9z9z
Revises: 6b7c8d9e0f1a, a1f5b7c9d2e4, e1f2g3h4i5j6
Create Date: 2026-09-01
"""
from typing import Sequence, Union


revision: str = "9z9z9z9z9z9z"
down_revision: Union[str, Sequence[str], None] = (
    "6b7c8d9e0f1a",
    "a1f5b7c9d2e4",
    "e1f2g3h4i5j6",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass