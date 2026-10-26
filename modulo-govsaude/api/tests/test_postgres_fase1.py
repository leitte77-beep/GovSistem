"""Migração da Fase 1 verificada em PostgreSQL real.

Execute com:
    GOVSAUDE_TEST_POSTGRES_URL=postgresql://user:pass@host:5432/db \
      alembic upgrade head && pytest -m postgres
"""

from __future__ import annotations

import os

import pytest

pytestmark = [
    pytest.mark.postgres,
    pytest.mark.skipif(
        not os.getenv("GOVSAUDE_TEST_POSTGRES_URL"),
        reason="GOVSAUDE_TEST_POSTGRES_URL não configurado",
    ),
]


async def test_migracao_fase1_cria_tabelas_e_colunas():
    import asyncpg

    conn = await asyncpg.connect(os.environ["GOVSAUDE_TEST_POSTGRES_URL"])
    try:
        tabelas = {
            linha["tablename"]
            for linha in await conn.fetch(
                "SELECT tablename FROM pg_tables "
                "WHERE schemaname = 'public' AND tablename = ANY($1::text[])",
                [
                    "servicos_classificacoes",
                    "procedimentos_autorizados",
                    "horarios_funcionamento",
                    "escalas",
                    "plantoes",
                    "prioridades",
                    "restricoes_horario_acesso",
                    "profissionais_especialidades",
                    "importacoes_cnes",
                ],
            )
        }
        assert tabelas == {
            "servicos_classificacoes",
            "procedimentos_autorizados",
            "horarios_funcionamento",
            "escalas",
            "plantoes",
            "prioridades",
            "restricoes_horario_acesso",
            "profissionais_especialidades",
            "importacoes_cnes",
        }
        colunas = {
            linha["column_name"]
            for linha in await conn.fetch(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = 'profissionais' "
                "AND column_name = ANY($1::text[])",
                ["nome_busca", "nome_fonetico", "email", "telefone", "versao"],
            )
        }
        assert colunas == {"nome_busca", "nome_fonetico", "email", "telefone", "versao"}
        referencia = await conn.fetchval(
            "SELECT to_regclass('referencia.cnes_estabelecimentos')::text"
        )
        assert referencia is not None
    finally:
        await conn.close()
