"""Modelo e schema de migration precisam concordar (§172).

A suíte em SQLite monta o schema pelos metadados, então uma divergência entre o
modelo e a migration passa despercebida — foi assim que `tarefas.prazo` ficou
`NOT NULL` no banco enquanto o modelo o tratava como opcional. Este teste roda
sobre o schema vindo das migrations e compara a nulabilidade coluna a coluna.
"""

import pytest
from sqlalchemy import inspect

from app.models import Base

# Colunas geradas criadas por migration e ausentes dos metadados: são esperadas.
_SO_NO_BANCO = {
    ("demandas", "busca_tsv"),
    ("demandas", "busca_texto"),
}


def _snapshot(conn) -> dict:
    insp = inspect(conn)
    dados = {}
    for tabela in insp.get_table_names(schema="public"):
        if tabela == "alembic_version":
            continue
        for coluna in insp.get_columns(tabela, schema="public"):
            dados[(tabela, coluna["name"])] = bool(coluna["nullable"])
    return dados


@pytest.mark.asyncio
async def test_colunas_do_modelo_batem_com_o_schema(db_engine):
    from tests.conftest import IS_POSTGRES

    if not IS_POSTGRES:
        pytest.skip("a comparação só faz sentido no schema montado pelas migrations")

    async with db_engine.connect() as conn:
        banco = await conn.run_sync(_snapshot)

    problema = []
    for tabela, obj in Base.metadata.tables.items():
        for coluna in obj.columns:
            chave = (tabela, coluna.name)
            if chave not in banco:
                problema.append(f"{tabela}.{coluna.name} existe no modelo e não no banco")
            elif banco[chave] != bool(coluna.nullable):
                problema.append(
                    f"{tabela}.{coluna.name}: modelo="
                    f"{'NULL' if coluna.nullable else 'NOT NULL'} banco="
                    f"{'NULL' if banco[chave] else 'NOT NULL'}"
                )
    for chave in banco:
        if chave not in {(t, c.name) for t, o in Base.metadata.tables.items() for c in o.columns}:
            if chave not in _SO_NO_BANCO:
                problema.append(f"{chave[0]}.{chave[1]} existe no banco e não no modelo")

    assert not problema, "Divergência modelo × migrations:\n" + "\n".join(problema)
