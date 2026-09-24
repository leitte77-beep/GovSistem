"""GovFrota Fase 2 — idempotência, índices compostos e auditoria append-only.

Revision ID: 002
Revises: 001
Create Date: 2026-08-26
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    is_postgres = bind.dialect.name == "postgresql"

    # ── Idempotência de abastecimento ─────────────────────────────────────
    op.add_column(
        "abastecimentos",
        sa.Column("idempotency_key", sa.String(64), nullable=True),
    )
    op.add_column(
        "abastecimentos",
        sa.Column(
            "idempotency_key_confirmed_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    op.create_index(
        "uq_abast_idempotency",
        "abastecimentos",
        ["organization_id", "idempotency_key"],
        unique=True,
    )

    # ── Índices compostos para consultas frequentes ──────────────────────
    op.create_index(
        "ix_abast_org_veiculo_data",
        "abastecimentos",
        ["organization_id", "veiculo_id", "data_abastecimento"],
    )
    op.create_index(
        "ix_abast_org_status_data",
        "abastecimentos",
        ["organization_id", "status", "data_abastecimento"],
    )
    op.create_index(
        "ix_movim_org_combustivel",
        "movimentacoes_estoque",
        ["organization_id", "combustivel_id", "created_at"],
    )
    op.create_index(
        "ix_entradas_org_cancelada",
        "entradas_combustivel",
        ["organization_id", "cancelada"],
    )

    # ── Auditoria append-only (PostgreSQL) ────────────────────────────────
    # Impede UPDATE e DELETE físico da tabela de auditoria na camada do banco.
    if is_postgres:
        op.execute(
            """
            CREATE OR REPLACE FUNCTION govfrota_block_audit_write()
            RETURNS trigger AS $$
            BEGIN
                RAISE EXCEPTION 'auditoria e append-only: alteracoes nao permitidas';
            END;
            $$ LANGUAGE plpgsql;
            """
        )
        op.execute(
            "CREATE TRIGGER trg_auditorias_no_update "
            "BEFORE UPDATE ON auditorias "
            "FOR EACH ROW EXECUTE FUNCTION govfrota_block_audit_write();"
        )
        op.execute(
            "CREATE TRIGGER trg_auditorias_no_delete "
            "BEFORE DELETE ON auditorias "
            "FOR EACH ROW EXECUTE FUNCTION govfrota_block_audit_write();"
        )


def downgrade() -> None:
    bind = op.get_bind()
    is_postgres = bind.dialect.name == "postgresql"

    if is_postgres:
        op.execute("DROP TRIGGER IF EXISTS trg_auditorias_no_delete ON auditorias;")
        op.execute("DROP TRIGGER IF EXISTS trg_auditorias_no_update ON auditorias;")
        op.execute("DROP FUNCTION IF EXISTS govfrota_block_audit_write();")

    op.drop_index("ix_entradas_org_cancelada", table_name="entradas_combustivel")
    op.drop_index("ix_movim_org_combustivel", table_name="movimentacoes_estoque")
    op.drop_index("ix_abast_org_status_data", table_name="abastecimentos")
    op.drop_index("ix_abast_org_veiculo_data", table_name="abastecimentos")
    op.drop_index("uq_abast_idempotency", table_name="abastecimentos")
    op.drop_column("abastecimentos", "idempotency_key_confirmed_at")
    op.drop_column("abastecimentos", "idempotency_key")
