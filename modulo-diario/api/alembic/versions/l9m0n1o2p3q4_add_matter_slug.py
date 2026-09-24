"""add matters.slug (Fase 4 / P0)

Revision ID: l9m0n1o2p3q4
Revises: k8l9m0n1o2p3
Create Date: 2026-09-22

Adiciona ``matters.slug`` (URL pública amigável), única por organização, e faz
o backfill determinístico das matérias existentes. O slug é congelado após a
publicação: não é recalculado depois.
"""

import re
import unicodedata

import sqlalchemy as sa
from alembic import op

revision = "l9m0n1o2p3q4"
down_revision = "k8l9m0n1o2p3"
branch_labels = None
depends_on = None


def _slugify(value: str) -> str:
    text = unicodedata.normalize("NFKD", str(value or "").lower())
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")


def _base_slug(act_type_name, number, year, title, matter_id) -> str:
    if act_type_name and number:
        base = f"{act_type_name}-{number}" + (f"-{year}" if year else "")
        slug = _slugify(base)
        if slug:
            return slug[:140]
    slug = _slugify(title)
    if slug:
        return slug[:140]
    return f"materia-{str(matter_id)[:8]}"


def upgrade() -> None:
    op.add_column("matters", sa.Column("slug", sa.String(160), nullable=True))
    op.create_index("ix_matters_slug", "matters", ["slug"])

    conn = op.get_bind()
    rows = conn.execute(
        sa.text(
            "SELECT m.id, m.organization_id, m.act_number, m.act_year, m.title, "
            "a.name AS act_type_name "
            "FROM matters m LEFT JOIN act_types a ON a.id = m.act_type_id "
            "ORDER BY m.created_at, m.id"
        )
    ).mappings().all()

    used: set[tuple] = set()
    for row in rows:
        base = _base_slug(
            row["act_type_name"], row["act_number"], row["act_year"],
            row["title"], row["id"],
        )
        candidate = base
        suffix = 2
        key = (str(row["organization_id"]), candidate)
        while key in used:
            candidate = f"{base}-{suffix}"
            key = (str(row["organization_id"]), candidate)
            suffix += 1
        used.add(key)
        conn.execute(
            sa.text("UPDATE matters SET slug = :slug WHERE id = :id"),
            {"slug": candidate[:160], "id": row["id"]},
        )

    # Unique per organization (NULLs remain allowed for any future row until set).
    dialect = conn.dialect.name
    if dialect == "sqlite":
        with op.batch_alter_table("matters") as batch_op:
            batch_op.create_unique_constraint(
                "uq_matters_org_slug", ["organization_id", "slug"]
            )
    else:
        op.create_unique_constraint(
            "uq_matters_org_slug", "matters", ["organization_id", "slug"]
        )


def downgrade() -> None:
    dialect = op.get_bind().dialect.name
    if dialect == "sqlite":
        with op.batch_alter_table("matters") as batch_op:
            batch_op.drop_constraint("uq_matters_org_slug", type_="unique")
    else:
        op.drop_constraint("uq_matters_org_slug", "matters", type_="unique")
    op.drop_index("ix_matters_slug", table_name="matters")
    op.drop_column("matters", "slug")
