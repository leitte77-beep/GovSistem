"""matter slug immutability (strong, two layers)

Revision ID: m1n2o3p4q5r6
Revises: l9m0n1o2p3q4
Create Date: 2026-09-22

Congela permanentemente o slug público de uma matéria na primeira publicação.
O marcador é ``matters.slug_locked_at`` (não o status, que muda ao longo do
tempo: retificada/substituída/arquivada). A garantia real é um trigger no banco:
nem ``UPDATE`` direto consegue mover a URL pública depois do lock.

Em PostgreSQL cria a função + trigger. Em SQLite (testes) cria o trigger
equivalente via ``batch`` não é necessário: ``op.execute`` basta.
"""

import sqlalchemy as sa
from alembic import op

revision = "m1n2o3p4q5r6"
down_revision = "l9m0n1o2p3q4"
branch_labels = None
depends_on = None

TRIGGER_NAME = "trg_matter_slug_immutable"
FUNCTION_NAME = "prevent_locked_matter_slug_change"

POSTGRES_FUNCTION_SQL = f"""
CREATE OR REPLACE FUNCTION {FUNCTION_NAME}()
RETURNS trigger AS $$
BEGIN
    IF OLD.slug_locked_at IS NOT NULL
       AND NEW.slug IS DISTINCT FROM OLD.slug THEN
        RAISE EXCEPTION
            'slug of published matter is immutable (matter %)', OLD.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
"""

POSTGRES_TRIGGER_SQL = f"""
CREATE TRIGGER {TRIGGER_NAME}
BEFORE UPDATE OF slug ON matters
FOR EACH ROW
EXECUTE FUNCTION {FUNCTION_NAME}();
"""

SQLITE_TRIGGER_SQL = f"""
CREATE TRIGGER IF NOT EXISTS {TRIGGER_NAME}
BEFORE UPDATE OF slug ON matters
FOR EACH ROW
WHEN OLD.slug_locked_at IS NOT NULL AND NEW.slug IS NOT OLD.slug
BEGIN
    SELECT RAISE(ABORT, 'slug of published matter is immutable');
END;
"""

BACKFILL_SQL = """
UPDATE matters
SET slug_locked_at = COALESCE(published_at, updated_at, created_at),
    slug_locked_reason = 'backfill'
WHERE slug IS NOT NULL
  AND slug_locked_at IS NULL
  AND (published_at IS NOT NULL OR status IN ('published', 'archived'))
"""


def upgrade() -> None:
    op.add_column(
        "matters",
        sa.Column("slug_locked_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "matters",
        sa.Column("slug_locked_reason", sa.String(50), nullable=True),
    )

    # Marca matérias já publicadas antes da introdução do lock.
    op.execute(sa.text(BACKFILL_SQL))

    dialect = op.get_bind().dialect.name
    if dialect == "postgresql":
        op.execute(sa.text(POSTGRES_FUNCTION_SQL))
        op.execute(sa.text(POSTGRES_TRIGGER_SQL))
    elif dialect == "sqlite":
        op.execute(sa.text(SQLITE_TRIGGER_SQL))


def downgrade() -> None:
    dialect = op.get_bind().dialect.name
    if dialect == "postgresql":
        op.execute(sa.text(f"DROP TRIGGER IF EXISTS {TRIGGER_NAME} ON matters"))
        op.execute(sa.text(f"DROP FUNCTION IF EXISTS {FUNCTION_NAME}()"))
    elif dialect == "sqlite":
        op.execute(sa.text(f"DROP TRIGGER IF EXISTS {TRIGGER_NAME}"))

    op.drop_column("matters", "slug_locked_reason")
    op.drop_column("matters", "slug_locked_at")
