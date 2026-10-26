"""Fase 1: rede de atenção, cadastros-base, escalas, prioridades e CNES.

A migração é idempotente de propósito: a ``0001`` usa
``Base.metadata.create_all`` e, em uma instalação nova, já cria as tabelas e
colunas atuais. Em uma instalação que estava na ``0001`` antiga, esta migração
adiciona as colunas/tabelas que faltam. O downgrade remove apenas o que a
Fase 1 introduziu.

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-26
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

from app.models import Base

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


NOVAS_TABELAS = [
    "servicos_classificacoes",
    "procedimentos_autorizados",
    "horarios_funcionamento",
    "escalas",
    "plantoes",
    "prioridades",
    "restricoes_horario_acesso",
    "profissionais_especialidades",
    "importacoes_cnes",
    "cnes_estabelecimentos",
]

COLUNAS_NOVAS: dict[str, list[sa.Column]] = {
    "estabelecimentos": [
        sa.Column("versao", sa.Integer(), nullable=False, server_default="1"),
    ],
    "setores": [
        sa.Column("versao", sa.Integer(), nullable=False, server_default="1"),
    ],
    "equipes": [
        sa.Column(
            "vigencia_inicio",
            sa.Date(),
            nullable=False,
            server_default=sa.text("CURRENT_DATE"),
        ),
        sa.Column("vigencia_fim", sa.Date(), nullable=True),
        sa.Column("versao", sa.Integer(), nullable=False, server_default="1"),
    ],
    "profissionais": [
        sa.Column("nome_busca", sa.String(length=200), nullable=True),
        sa.Column("nome_fonetico", sa.String(length=200), nullable=True),
        sa.Column("email", sa.String(length=200), nullable=True),
        sa.Column("telefone", sa.String(length=20), nullable=True),
        sa.Column("versao", sa.Integer(), nullable=False, server_default="1"),
    ],
    "entes_consorciados": [
        sa.Column("versao", sa.Integer(), nullable=False, server_default="1"),
    ],
}

INDICES_NOVOS = [
    (
        "ix_profissionais_tenant_nome_busca",
        "profissionais",
        ["tenant_id", "nome_busca"],
        False,
        None,
    ),
    (
        "uq_profissionais_cpf_hash_ativo",
        "profissionais",
        ["tenant_id", "cpf_hash"],
        True,
        "cpf_hash IS NOT NULL AND baixa_em IS NULL",
    ),
    (
        "uq_profissionais_cns_hash_ativo",
        "profissionais",
        ["tenant_id", "cns_hash"],
        True,
        "cns_hash IS NOT NULL AND baixa_em IS NULL",
    ),
]

CHECKS_NOVOS = [
    ("ck_equipes_tipo", "equipes", "tipo IN ('ESF','EAP','ESB','EMULTI','OUTRA')"),
    (
        "ck_entes_consorciados_situacao",
        "entes_consorciados",
        "situacao IN ('ATIVO','INATIVO','SUSPENSO')",
    ),
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
    return inspect(bind).has_table(nome, schema=tabela.schema)


def _colunas(bind, tabela: str) -> set[str]:
    inspetor = inspect(bind)
    if not inspetor.has_table(tabela):
        return set()
    return {coluna["name"] for coluna in inspetor.get_columns(tabela)}


def _indices(bind, tabela: str) -> set[str]:
    inspetor = inspect(bind)
    if not inspetor.has_table(tabela):
        return set()
    return {indice["name"] for indice in inspetor.get_indexes(tabela)}


def _checks(bind, tabela: str) -> set[str]:
    inspetor = inspect(bind)
    if not inspetor.has_table(tabela):
        return set()
    try:
        return {
            check["name"]
            for check in inspetor.get_check_constraints(tabela)
            if check.get("name")
        }
    except NotImplementedError:
        return set()


def upgrade() -> None:
    bind = op.get_bind()
    inspetor = inspect(bind)

    for tabela, colunas in COLUNAS_NOVAS.items():
        existentes = _colunas(bind, tabela)
        for coluna in colunas:
            if coluna.name not in existentes:
                op.add_column(tabela, coluna)

    for nome in NOVAS_TABELAS:
        if not _existe_tabela(bind, nome):
            tabela = _tabela_metadata(nome)
            if tabela is not None:
                tabela.create(bind)

    for nome, tabela, colunas, unico, where in INDICES_NOVOS:
        if nome in _indices(bind, tabela):
            continue
        kwargs = {}
        if where:
            kwargs["postgresql_where"] = sa.text(where)
            kwargs["sqlite_where"] = sa.text(where)
        op.create_index(nome, tabela, colunas, unique=unico, **kwargs)

    if bind.dialect.name != "sqlite":
        for nome, tabela, expressao in CHECKS_NOVOS:
            if nome in _checks(bind, tabela):
                continue
            op.create_check_constraint(nome, tabela, expressao)


def downgrade() -> None:
    bind = op.get_bind()

    for nome, tabela, _colunas_, _unico, _where in INDICES_NOVOS:
        if nome in _indices(bind, tabela):
            op.drop_index(nome, table_name=tabela)

    if bind.dialect.name != "sqlite":
        for nome, tabela, _expressao in CHECKS_NOVOS:
            if nome in _checks(bind, tabela):
                op.drop_constraint(nome, tabela, type_="check")

    for nome in reversed(NOVAS_TABELAS):
        if _existe_tabela(bind, nome):
            tabela = _tabela_metadata(nome)
            if tabela is not None:
                tabela.drop(bind, checkfirst=True)

    for tabela, colunas in COLUNAS_NOVAS.items():
        existentes = _colunas(bind, tabela)
        for coluna in reversed(colunas):
            if coluna.name not in existentes:
                continue
            if bind.dialect.name == "sqlite":
                with op.batch_alter_table(tabela) as batch:
                    batch.drop_column(coluna.name)
            else:
                op.drop_column(tabela, coluna.name)
