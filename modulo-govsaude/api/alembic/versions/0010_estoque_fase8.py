"""Fase 8: estoque, almoxarifado e assistência farmacêutica.

Idempotente como as anteriores: cria só as tabelas que faltam. O downgrade
remove apenas as tabelas da Fase 8.

Revision ID: 0010
Revises: 0009
Create Date: 2026-10-26
"""

from __future__ import annotations

from collections.abc import Sequence

from sqlalchemy import inspect

from alembic import op
from app.models import Base

revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

NOVAS_TABELAS = [
    "produtos_estoque",
    "locais_estoque",
    "lotes_estoque",
    "parametros_estoque",
    "movimentacoes_estoque",
    "requisicoes_estoque",
    "inventarios_estoque",
    "competencias_estoque",
    "dispensacoes",
    "temperaturas_estoque",
]


def upgrade() -> None:
    bind = op.get_bind()
    existentes = set(inspect(bind).get_table_names())
    Base.metadata.create_all(
        bind=bind,
        tables=[Base.metadata.tables[n] for n in NOVAS_TABELAS if n not in existentes],
        checkfirst=True,
    )
    if bind.dialect.name == "postgresql":
        # Ledger imutável também no banco: UPDATE/DELETE são recusados.
        op.execute(
            """
            CREATE OR REPLACE FUNCTION govsaude_ledger_estoque_imutavel()
            RETURNS trigger AS $$
            BEGIN
                RAISE EXCEPTION 'movimentacoes_estoque é imutável; lance ajuste ou estorno';
            END;
            $$ LANGUAGE plpgsql;
            """
        )
        op.execute("DROP TRIGGER IF EXISTS trg_ledger_estoque_imutavel ON movimentacoes_estoque")
        op.execute(
            """
            CREATE TRIGGER trg_ledger_estoque_imutavel
            BEFORE UPDATE OR DELETE ON movimentacoes_estoque
            FOR EACH ROW EXECUTE FUNCTION govsaude_ledger_estoque_imutavel();
            """
        )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("DROP TRIGGER IF EXISTS trg_ledger_estoque_imutavel ON movimentacoes_estoque")
        op.execute("DROP FUNCTION IF EXISTS govsaude_ledger_estoque_imutavel()")
    for nome in reversed(NOVAS_TABELAS):
        if inspect(bind).has_table(nome):
            Base.metadata.tables[nome].drop(bind, checkfirst=True)
