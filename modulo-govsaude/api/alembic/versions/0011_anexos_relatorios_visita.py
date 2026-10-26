"""Fechamento das lacunas da revisão: anexos clínicos e visita estruturada do ACS.

Idempotente: cria ``anexos_clinicos`` e as colunas da visita só se faltarem.

Revision ID: 0011
Revises: 0010
Create Date: 2026-10-26
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import op
from app.models import Base

revision: str = "0011"
down_revision: str | None = "0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

COLUNAS_VISITA = [
    sa.Column("motivos", sa.JSON(), nullable=True),
    sa.Column("busca_ativa", sa.Boolean(), nullable=False, server_default=sa.false()),
    sa.Column("acompanhamento", sa.JSON(), nullable=True),
    sa.Column("controle_ambiental", sa.JSON(), nullable=True),
    sa.Column("medicoes", sa.JSON(), nullable=True),
    sa.Column("desfecho", sa.String(60), nullable=True),
]


def upgrade() -> None:
    bind = op.get_bind()
    if not inspect(bind).has_table("anexos_clinicos"):
        Base.metadata.tables["anexos_clinicos"].create(bind, checkfirst=True)
    existentes = {c["name"] for c in inspect(bind).get_columns("visitas_domiciliares")}
    for coluna in COLUNAS_VISITA:
        if coluna.name not in existentes:
            op.add_column("visitas_domiciliares", coluna)


def downgrade() -> None:
    bind = op.get_bind()
    existentes = {c["name"] for c in inspect(bind).get_columns("visitas_domiciliares")}
    for coluna in reversed(COLUNAS_VISITA):
        if coluna.name in existentes:
            op.drop_column("visitas_domiciliares", coluna.name)
    if inspect(bind).has_table("anexos_clinicos"):
        Base.metadata.tables["anexos_clinicos"].drop(bind, checkfirst=True)
