"""Fase 4: agenda, recepção, fila, classificação de risco e painéis.

Idempotente como as migrações anteriores: a ``0001`` cria o metadata atual em
instalação nova; em instalação existente esta migração cria apenas as tabelas
que faltam. O downgrade remove somente as tabelas da Fase 4.

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-26
"""

from __future__ import annotations

from typing import Sequence, Union

from sqlalchemy import inspect

from alembic import op
from app.models import Base

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


NOVAS_TABELAS = [
    "protocolos_classificacao_risco",
    "niveis_classificacao_risco",
    "agendas",
    "agenda_horarios",
    "agenda_bloqueios",
    "agendamentos",
    "filas_atendimento",
    "eventos_fila",
    "paineis_chamada",
    "chamadas_painel",
]

ORDEM_DOWNGRADE = [
    "chamadas_painel",
    "eventos_fila",
    "filas_atendimento",
    "agendamentos",
    "agenda_bloqueios",
    "agenda_horarios",
    "agendas",
    "niveis_classificacao_risco",
    "protocolos_classificacao_risco",
    "paineis_chamada",
]


def _tabela_metadata(nome: str):
    for tabela in Base.metadata.tables.values():
        if tabela.name == nome:
            return tabela
    return None


def _existe_tabela(bind, nome: str) -> bool:
    tabela = _tabela_metadata(nome)
    if tabela is None:
        return False
    return inspect(bind).has_table(tabela.name, schema=tabela.schema)


def upgrade() -> None:
    bind = op.get_bind()
    tabelas = []
    for nome in NOVAS_TABELAS:
        if _existe_tabela(bind, nome):
            continue
        tabela = _tabela_metadata(nome)
        if tabela is not None:
            tabelas.append(tabela)
    if tabelas:
        Base.metadata.create_all(bind=bind, tables=tabelas, checkfirst=True)


def downgrade() -> None:
    bind = op.get_bind()
    for nome in ORDEM_DOWNGRADE:
        if not _existe_tabela(bind, nome):
            continue
        tabela = _tabela_metadata(nome)
        if tabela is not None:
            tabela.drop(bind, checkfirst=True)
