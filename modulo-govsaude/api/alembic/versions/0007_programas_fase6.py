"""Fase 6: programas, linhas de cuidado, inscrições, programação e busca ativa.

Idempotente como as migrações anteriores: em instalação nova a ``0001`` já cria
o metadata completo; em instalação existente esta migração cria apenas as
tabelas que faltam. O downgrade remove somente as tabelas da Fase 6.

Revision ID: 0007
Revises: 0006
Create Date: 2026-10-26
"""

from __future__ import annotations

from collections.abc import Sequence

from sqlalchemy import inspect

from alembic import op
from app.models import Base

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


NOVAS_TABELAS = [
    "programas",
    "programa_itens",
    "programa_inscricoes",
    "programa_programacoes",
    "programa_buscas_ativas",
]

ORDEM_DOWNGRADE = [
    "programa_buscas_ativas",
    "programa_programacoes",
    "programa_inscricoes",
    "programa_itens",
    "programas",
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
