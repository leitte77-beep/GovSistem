"""Estrutura inicial do GovSaúde (Fase 0).

Cria o schema ``referencia``, todas as tabelas da fundação, a auditoria
particionada por mês e o trigger append-only no PostgreSQL. O downgrade remove
tudo que esta migração criou.

Revision ID: 0001
Revises:
Create Date: 2026-10-26
"""

from __future__ import annotations

from datetime import date
from typing import Sequence, Union

from alembic import op
from sqlalchemy import text

from app.models import Base

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _proximo_mes(inicio: date) -> date:
    if inicio.month == 12:
        return date(inicio.year + 1, 1, 1)
    return date(inicio.year, inicio.month + 1, 1)


def _particoes_auditoria(bind) -> None:
    op.execute(
        """
        CREATE OR REPLACE FUNCTION govsaude_criar_particao_auditoria(p_data date)
        RETURNS void AS $$
        DECLARE
            v_inicio date := date_trunc('month', p_data)::date;
            v_fim date := (date_trunc('month', p_data) + interval '1 month')::date;
            v_nome text := 'audit_trail_' || to_char(v_inicio, 'YYYYMM');
        BEGIN
            IF to_regclass(format('public.%I', v_nome)) IS NULL THEN
                EXECUTE format(
                    'CREATE TABLE %I PARTITION OF audit_trail FOR VALUES FROM (%L) TO (%L)',
                    v_nome, v_inicio, v_fim
                );
            END IF;
            IF NOT EXISTS (
                SELECT 1 FROM pg_trigger
                WHERE tgname = 'trg_audit_append_only'
                  AND tgrelid = format('public.%I', v_nome)::regclass
            ) THEN
                EXECUTE format(
                    'CREATE TRIGGER trg_audit_append_only BEFORE UPDATE OR DELETE ON %I '
                    'FOR EACH ROW EXECUTE FUNCTION govsaude_audit_append_only()',
                    v_nome
                );
            END IF;
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    hoje = date.today().replace(day=1)
    meses = [
        date(hoje.year - 1, 12, 1) if hoje.month == 1 else date(hoje.year, hoje.month - 1, 1),
        hoje,
        _proximo_mes(hoje),
        _proximo_mes(_proximo_mes(hoje)),
        _proximo_mes(_proximo_mes(_proximo_mes(hoje))),
    ]
    for mes in meses:
        op.execute(f"SELECT govsaude_criar_particao_auditoria('{mes.isoformat()}'::date)")
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS audit_trail_default
        PARTITION OF audit_trail DEFAULT;
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_trigger
                WHERE tgname = 'trg_audit_append_only'
                  AND tgrelid = 'public.audit_trail_default'::regclass
            ) THEN
                CREATE TRIGGER trg_audit_append_only
                BEFORE UPDATE OR DELETE ON audit_trail_default
                FOR EACH ROW EXECUTE FUNCTION govsaude_audit_append_only();
            END IF;
        END $$;
        """
    )




def _particoes_integracao(bind) -> None:
    op.execute(
        """
        CREATE OR REPLACE FUNCTION govsaude_criar_particao_integracao(p_data date)
        RETURNS void AS $$
        DECLARE
            v_inicio date := date_trunc('month', p_data)::date;
            v_fim date := (date_trunc('month', p_data) + interval '1 month')::date;
            v_nome text := 'integracao_envios_' || to_char(v_inicio, 'YYYYMM');
        BEGIN
            IF to_regclass(format('public.%I', v_nome)) IS NULL THEN
                EXECUTE format(
                    'CREATE TABLE %I PARTITION OF integracao_envios '
                    'FOR VALUES FROM (%L) TO (%L)',
                    v_nome, v_inicio, v_fim
                );
            END IF;
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    hoje = date.today().replace(day=1)
    meses = [
        hoje,
        _proximo_mes(hoje),
        _proximo_mes(_proximo_mes(hoje)),
    ]
    for mes in meses:
        op.execute(f"SELECT govsaude_criar_particao_integracao('{mes.isoformat()}'::date)")
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS integracao_envios_default
        PARTITION OF integracao_envios DEFAULT;
        """
    )


def _trigger_auditoria(bind) -> None:
    op.execute(
        """
        CREATE OR REPLACE FUNCTION govsaude_audit_append_only()
        RETURNS trigger AS $$
        BEGIN
            RAISE EXCEPTION
                'audit_trail é append-only: UPDATE/DELETE proibidos (tabela %)', TG_TABLE_NAME
                USING ERRCODE = 'insufficient_privilege';
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute("DROP TRIGGER IF EXISTS trg_audit_append_only ON audit_trail")
    op.execute(
        """
        CREATE TRIGGER trg_audit_append_only
        BEFORE UPDATE OR DELETE ON audit_trail
        FOR EACH STATEMENT EXECUTE FUNCTION govsaude_audit_append_only();
        """
    )


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute('CREATE SCHEMA IF NOT EXISTS "referencia"')
        for extensao in ("pg_trgm", "unaccent", "postgis"):
            op.execute(f'CREATE EXTENSION IF NOT EXISTS "{extensao}"')
    Base.metadata.create_all(bind=bind, checkfirst=True)
    if bind.dialect.name == "postgresql":
        _trigger_auditoria(bind)
        _particoes_auditoria(bind)
        _particoes_integracao(bind)
        op.execute(
            "COMMENT ON TABLE audit_trail IS "
            "'Trilha append-only particionada por mês; trigger bloqueia UPDATE/DELETE.'"
        )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("DROP TRIGGER IF EXISTS trg_audit_append_only ON audit_trail")
        for tabela in reversed(Base.metadata.sorted_tables):
            qualificado = (
                f'"{tabela.schema}"."{tabela.name}"'
                if tabela.schema
                else f'"{tabela.name}"'
            )
            op.execute(f"DROP TABLE IF EXISTS {qualificado} CASCADE")
    else:
        Base.metadata.drop_all(bind=bind, checkfirst=True)
    if bind.dialect.name == "postgresql":
        op.execute("DROP FUNCTION IF EXISTS govsaude_audit_append_only() CASCADE")
        op.execute("DROP FUNCTION IF EXISTS govsaude_criar_particao_auditoria(date) CASCADE")
        op.execute("DROP FUNCTION IF EXISTS govsaude_criar_particao_integracao(date) CASCADE")
        op.execute('DROP SCHEMA IF EXISTS "referencia" CASCADE')
