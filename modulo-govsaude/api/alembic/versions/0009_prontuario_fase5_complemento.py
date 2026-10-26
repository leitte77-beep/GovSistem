"""Fase 5: complemento do PEC (alergias, etapas, sigilo/retificação de registros,
cópia de prescrição, validação de problemas).

Idempotente como as anteriores: cria só o que falta. As colunas SOAP passam a
``CampoProtegido`` (Text cifrado), sem mudança de tipo físico.

Revision ID: 0009
Revises: 0008
Create Date: 2026-10-26
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import op
from app.models import Base

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

COLUNAS = {
    "atendimentos": [sa.Column("etapa", sa.String(40), nullable=True)],
    "problemas_clinicos": [
        sa.Column("validado_referencia", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("encerrado_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("encerrado_motivo", sa.Text(), nullable=True),
    ],
    "prescricoes": [sa.Column("copiada_de_id", sa.Uuid(), nullable=True)],
    "registros_assistenciais": [
        sa.Column("sigiloso", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("formulario_id", sa.Uuid(), nullable=True),
        sa.Column("versao_formulario", sa.Integer(), nullable=True),
        sa.Column("retificacao_justificativa", sa.Text(), nullable=True),
    ],
}


def upgrade() -> None:
    bind = op.get_bind()
    if not inspect(bind).has_table("alergias"):
        Base.metadata.tables["alergias"].create(bind, checkfirst=True)
    for tabela, colunas in COLUNAS.items():
        existentes = {c["name"] for c in inspect(bind).get_columns(tabela)}
        for coluna in colunas:
            if coluna.name not in existentes:
                op.add_column(tabela, coluna)


def downgrade() -> None:
    bind = op.get_bind()
    for tabela, colunas in COLUNAS.items():
        existentes = {c["name"] for c in inspect(bind).get_columns(tabela)}
        for coluna in reversed(colunas):
            if coluna.name in existentes:
                op.drop_column(tabela, coluna.name)
    if inspect(bind).has_table("alergias"):
        Base.metadata.tables["alergias"].drop(bind, checkfirst=True)
