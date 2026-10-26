"""Testes que exigem PostgreSQL real (trigger e partições).

Execute com:
    GOVSAUDE_TEST_POSTGRES_URL=postgresql://user:pass@host:5432/db \
      alembic upgrade head && pytest -m postgres
"""

from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone

import pytest

pytestmark = [
    pytest.mark.postgres,
    pytest.mark.skipif(
        not os.getenv("GOVSAUDE_TEST_POSTGRES_URL"),
        reason="GOVSAUDE_TEST_POSTGRES_URL não configurado",
    ),
]


async def test_particao_mensal_e_trigger_append_only():
    import asyncpg

    conn = await asyncpg.connect(os.environ["GOVSAUDE_TEST_POSTGRES_URL"])
    try:
        evento_id = uuid.uuid4()
        await conn.execute(
            "INSERT INTO audit_trail "
            "(id, created_at, tenant_id, modulo, acao, resultado) "
            "VALUES ($1, $2, NULL, 'govsaude', 'TESTE', 'SUCESSO')",
            evento_id,
            datetime.now(timezone.utc),
        )
        with pytest.raises(asyncpg.PostgresError):
            await conn.execute(
                "UPDATE audit_trail SET acao='ALTERADO' WHERE id=$1", evento_id
            )
        with pytest.raises(asyncpg.PostgresError):
            await conn.execute("DELETE FROM audit_trail WHERE id=$1", evento_id)
        particao = await conn.fetchval(
            "SELECT tableoid::regclass::text FROM audit_trail WHERE id=$1", evento_id
        )
        assert particao.startswith("audit_trail_") and particao != "audit_trail_default"
    finally:
        await conn.close()
