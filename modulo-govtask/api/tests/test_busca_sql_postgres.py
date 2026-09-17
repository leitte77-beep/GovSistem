"""O SQL que a busca gera para PostgreSQL, compilado sem banco.

A suíte roda em SQLite, então o ramo PostgreSQL de `aplicar_busca` nunca é
executado pelos testes de rota — e foi exatamente ali que passou um defeito até
produção: uma expressão de função montada em Python e entregue a `bindparams`
virava argumento de consulta, e o driver recusava com
"expected str, got websearch_to_tsquery".

Estes testes compilam a consulta contra o dialeto do PostgreSQL e conferem o
texto e os parâmetros. Não substituem rodar contra um banco real, mas travam a
classe de erro que não dá para ver em SQLite.
"""

import pytest
from sqlalchemy import select
from sqlalchemy.dialects import postgresql

from app.models.demanda import Demanda
from app.services.busca import CONFIG_FTS, aplicar_busca


class _BindFalso:
    """Finge ser o bind de uma sessão PostgreSQL, sem abrir conexão."""

    class dialect:  # noqa: D106
        name = "postgresql"


class _SessaoFalsa:
    bind = _BindFalso()


def _compilar(termo: str):
    stmt = aplicar_busca(select(Demanda.id), _SessaoFalsa(), termo)
    return stmt.compile(dialect=postgresql.dialect())


def test_usa_as_duas_estruturas_de_indice():
    sql = str(_compilar("ambulância"))
    assert "busca_tsv" in sql and "websearch_to_tsquery" in sql
    # O trigrama entra em OR para cobrir o que o stemmer não unifica.
    assert "busca_texto LIKE" in sql
    assert " OR " in sql


def test_todo_parametro_e_valor_primitivo():
    """Nenhum parâmetro pode ser expressão SQL — foi o bug que vazou."""
    compilado = _compilar("ambulância")
    assert compilado.params, "a consulta deveria ter parâmetros ligados"
    for nome, valor in compilado.params.items():
        assert isinstance(valor, (str, int, float, bool, type(None))), (
            f"parâmetro {nome} é {type(valor).__name__}; o driver só aceita "
            "valores primitivos"
        )


def test_config_e_termo_vao_como_parametro():
    params = _compilar("escola").params
    assert CONFIG_FTS in params.values()
    assert "escola" in params.values()


@pytest.mark.parametrize(
    "termo, esperado",
    [
        ("100%", "%100\\%%"),
        ("a_b", "%a\\_b%"),
        ("c\\d", "%c\\\\d%"),
        ("Ambulância", "%ambulância%"),
    ],
)
def test_curinga_do_like_e_escapado(termo, esperado):
    """Um termo com `%` não pode virar curinga e casar a base inteira."""
    assert esperado in _compilar(termo).params.values()


def test_termo_vazio_nao_filtra():
    stmt = aplicar_busca(select(Demanda.id), _SessaoFalsa(), "   ")
    assert "busca_tsv" not in str(stmt.compile(dialect=postgresql.dialect()))
