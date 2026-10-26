"""Migração da Fase 2 verificada em PostgreSQL real."""

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


async def test_migracao_fase2_cria_tabelas_e_ceps():
    import asyncpg

    conn = await asyncpg.connect(os.environ["GOVSAUDE_TEST_POSTGRES_URL"])
    try:
        tabelas = {
            linha["tablename"]
            for linha in await conn.fetch(
                "SELECT tablename FROM pg_tables "
                "WHERE schemaname = 'public' AND tablename = ANY($1::text[])",
                [
                    "cidadaos",
                    "cidadao_documentos",
                    "cidadao_contatos",
                    "cidadao_enderecos",
                    "cidadao_fotos",
                    "planos_saude_vinculos",
                    "cidadao_alergias",
                    "cidadao_condicoes",
                    "cidadao_duplicidades",
                    "cidadao_unificacoes",
                    "cidadao_baixas",
                ],
            )
        }
        assert len(tabelas) == 11
        assert await conn.fetchval("SELECT to_regclass('referencia.ceps')::text")
        colunas = {
            linha["column_name"]
            for linha in await conn.fetch(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = 'cidadaos' "
                "AND column_name = ANY($1::text[])",
                ["nome_social", "nome_fonetico", "cpf_hash", "cns_hash", "mae_id", "versao"],
            )
        }
        assert colunas == {
            "nome_social",
            "nome_fonetico",
            "cpf_hash",
            "cns_hash",
            "mae_id",
            "versao",
        }
    finally:
        await conn.close()
