"""Fase 2: cadastro único do cidadão, deduplicação, unificação e CEP.

Idempotente como a 0002: em instalação nova a 0001 já cria as tabelas a partir
do metadata atual; em instalação existente esta migração cria o que falta.

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-26
"""

from __future__ import annotations

from typing import Sequence, Union

from sqlalchemy import inspect

from alembic import op
from app.models import Base

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


NOVAS_TABELAS = [
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
    "ceps",
]

ORDEM_DOWNGRADE = [
    "cidadao_unificacoes",
    "cidadao_duplicidades",
    "cidadao_baixas",
    "cidadao_condicoes",
    "cidadao_alergias",
    "planos_saude_vinculos",
    "cidadao_fotos",
    "cidadao_enderecos",
    "cidadao_contatos",
    "cidadao_documentos",
    "cidadaos",
    "ceps",
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
        # create_all emite os ALTERs necessários para FKs com use_alter=True
        # (ActorMixin/BaixaMixin e auto-relacionamentos de cidadaos).
        Base.metadata.create_all(bind=bind, tables=tabelas, checkfirst=True)


def downgrade() -> None:
    bind = op.get_bind()
    for nome in ORDEM_DOWNGRADE:
        if not _existe_tabela(bind, nome):
            continue
        tabela = _tabela_metadata(nome)
        if tabela is not None:
            tabela.drop(bind, checkfirst=True)
