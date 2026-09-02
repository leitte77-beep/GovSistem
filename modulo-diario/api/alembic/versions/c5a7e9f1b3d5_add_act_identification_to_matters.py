"""act identification metadata on matters

Additive, non-destructive: new nullable columns so existing matters
(which only have title/summary) remain valid and fully functional.

- matters.act_number: structured act number (e.g. "04")
- matters.act_year: structured act year (e.g. 2026)
- matters.act_date: date the act was issued
- matters.responsible_name / responsible_role: authority responsible for the
  act (NOT the author who typed it — used for signature/models/validation)
- matters.publication_type: normal | rectification | republication
- matters: partial unique index per org/type/year/number for lookups
- act_types.config: optional per-type numbering/title rules (JSONB), so the
  frontend never hardcodes which fields a given act type requires.

Revision ID: c5a7e9f1b3d5
Revises: 9z9z9z9z9z9z
Create Date: 2026-09-02 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "c5a7e9f1b3d5"
down_revision: Union[str, None] = "9z9z9z9z9z9z"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "matters",
        sa.Column("act_number", sa.String(30), nullable=True,
                  comment="Structured act number (e.g. 04) - enables search/filter/sort"),
    )
    op.add_column(
        "matters",
        sa.Column("act_year", sa.Integer(), nullable=True,
                  comment="Structured act year (e.g. 2026)"),
    )
    op.add_column(
        "matters",
        sa.Column("act_date", sa.Date(), nullable=True,
                  comment="Date the act was issued"),
    )
    op.add_column(
        "matters",
        sa.Column("responsible_name", sa.String(255), nullable=True,
                  comment="Authority responsible for the act (not the author)"),
    )
    op.add_column(
        "matters",
        sa.Column("responsible_role", sa.String(255), nullable=True,
                  comment="Role/title of the responsible authority"),
    )
    op.add_column(
        "matters",
        sa.Column("publication_type", sa.String(20), nullable=True,
                  server_default="normal",
                  comment="normal | rectification | republication"),
    )

    # Non-unique index: search/filter/report ordering by structured identity.
    # Not unique because legacy data may legitimately contain duplicates.
    op.create_index(
        "ix_matters_org_type_year_number",
        "matters",
        ["organization_id", "act_type_id", "act_year", "act_number"],
    )

    # Per-type configurable rules (optional, global catalog table)
    op.add_column(
        "act_types",
        sa.Column("config", postgresql.JSONB(astext_type=sa.Text()), nullable=True,
                  comment="Optional rules: number_required, year_required, "
                          "title_pattern, title_uppercase"),
    )


def downgrade() -> None:
    op.drop_column("act_types", "config")
    op.drop_index("ix_matters_org_type_year_number", table_name="matters")
    for col in (
        "publication_type",
        "responsible_role",
        "responsible_name",
        "act_date",
        "act_year",
        "act_number",
    ):
        op.drop_column("matters", col)
