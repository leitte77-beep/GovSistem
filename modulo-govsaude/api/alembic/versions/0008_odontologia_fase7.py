"""Fase 7: odontologia (condições, odontograma versionado, atendimento, procedimentos, documentos).

Idempotente como as migrações anteriores: em instalação nova a ``0001`` já cria
o metadata completo; em instalação existente esta migração cria apenas as
tabelas que faltam. O downgrade remove somente as tabelas da Fase 7.

Revision ID: 0008
Revises: 0006
Create Date: 2026-10-26
"""

from __future__ import annotations

from collections.abc import Sequence

from sqlalchemy import inspect

from alembic import op
from app.models import Base

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


NOVAS_TABELAS = [
    "odonto_condicoes",
    "odonto_atendimentos",
    "odontogramas",
    "odonto_procedimentos",
    "odonto_documentos",
]

ORDEM_DOWNGRADE = [
    "odonto_documentos",
    "odonto_procedimentos",
    "odontogramas",
    "odonto_atendimentos",
    "odonto_condicoes",
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
