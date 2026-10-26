"""Fase 5: PEC ambulatorial.

Revision ID: 0006
Revises: 0005
"""

import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import op
from app.models import Base

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None
TABELAS = [
    "atendimentos",
    "evolucoes_soap",
    "sinais_vitais",
    "problemas_clinicos",
    "planos_cuidado",
    "prescricoes",
    "registros_assistenciais",
]


def upgrade():
    bind = op.get_bind()
    existentes = set(inspect(bind).get_table_names())
    Base.metadata.create_all(
        bind=bind,
        tables=[Base.metadata.tables[n] for n in TABELAS if n not in existentes],
        checkfirst=True,
    )
    if "atendimentos" in existentes:
        colunas = {c["name"] for c in inspect(bind).get_columns("atendimentos")}
        for nome, coluna in (
            ("tipo", sa.Column("tipo", sa.String(40), nullable=False, server_default="CONSULTA")),
            ("dados_triagem", sa.Column("dados_triagem", sa.JSON(), nullable=True)),
            ("classificacao_risco", sa.Column("classificacao_risco", sa.String(40), nullable=True)),
            (
                "retroativo",
                sa.Column("retroativo", sa.Boolean(), nullable=False, server_default=sa.false()),
            ),
            (
                "justificativa_retroativa",
                sa.Column("justificativa_retroativa", sa.Text(), nullable=True),
            ),
        ):
            if nome not in colunas:
                op.add_column("atendimentos", coluna)


def downgrade():
    bind = op.get_bind()
    if inspect(bind).has_table("atendimentos"):
        for nome in (
            "justificativa_retroativa",
            "retroativo",
            "classificacao_risco",
            "dados_triagem",
            "tipo",
        ):
            colunas = {c["name"] for c in inspect(bind).get_columns("atendimentos")}
            if nome in colunas:
                op.drop_column("atendimentos", nome)
    for n in reversed(TABELAS):
        if inspect(bind).has_table(n):
            Base.metadata.tables[n].drop(bind, checkfirst=True)
