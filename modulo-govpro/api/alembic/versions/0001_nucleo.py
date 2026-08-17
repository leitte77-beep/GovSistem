"""núcleo GovPro (Fase 1)

Revision ID: 0001_nucleo
Revises:
Create Date: 2026-08-13
"""

from alembic import op

from app.models import Base

revision = "0001_nucleo"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    Base.metadata.create_all(bind=bind)

    # Trilha de auditoria APPEND-ONLY: bloqueia UPDATE/DELETE no banco (prova).
    # Dividido em statements individuais: o asyncpg não aceita múltiplos
    # comandos em um único execute (prepared statement).
    op.execute(
        """
        CREATE OR REPLACE FUNCTION block_audit_trail_mutation() RETURNS trigger AS $$
        BEGIN
            RAISE EXCEPTION 'audit_trail é append-only (sem UPDATE/DELETE)';
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute("DROP TRIGGER IF EXISTS trg_block_audit_mutation ON audit_trail")
    op.execute(
        """
        CREATE TRIGGER trg_block_audit_mutation
        BEFORE UPDATE OR DELETE ON audit_trail
        FOR EACH ROW EXECUTE FUNCTION block_audit_trail_mutation()
        """
    )


def downgrade() -> None:
    bind = op.get_bind()
    op.execute("DROP TRIGGER IF EXISTS trg_block_audit_mutation ON audit_trail;")
    op.execute("DROP FUNCTION IF EXISTS block_audit_trail_mutation();")
    Base.metadata.drop_all(bind=bind)
