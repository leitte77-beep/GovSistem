"""Fase 5: complemento do PEC (etapas, sigilo/retificação de registros, cópia de
prescrição) e código do agente na alergia do cadastro (alerta de prescrição).

Alergias e problemas do PEC são os do cadastro do cidadão (Fase 2); o PEC não
mantém lista própria.

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

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

COLUNAS = {
    "atendimentos": [
        sa.Column("etapa", sa.String(40), nullable=True),
        sa.Column("nivel_sigilo", sa.String(30), nullable=False, server_default="NORMAL"),
        sa.Column("especialidade_id", sa.Uuid(), nullable=True),
        sa.Column("fila_id", sa.Uuid(), nullable=True),
    ],
    "cidadao_alergias": [sa.Column("codigo", sa.String(30), nullable=True)],
    "planos_cuidado": [
        sa.Column("vigencia_inicio", sa.Date(), nullable=True),
        sa.Column("vigencia_fim", sa.Date(), nullable=True),
    ],
    "prescricoes": [sa.Column("copiada_de_id", sa.Uuid(), nullable=True)],
    "registros_assistenciais": [
        sa.Column("sigiloso", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("nivel_sigilo", sa.String(30), nullable=False, server_default="NORMAL"),
        sa.Column("especialidade_id", sa.Uuid(), nullable=True),
        sa.Column("formulario_id", sa.Uuid(), nullable=True),
        sa.Column("versao_formulario", sa.Integer(), nullable=True),
        sa.Column("retificacao_justificativa", sa.Text(), nullable=True),
    ],
}


def upgrade() -> None:
    bind = op.get_bind()
    for tabela, colunas in COLUNAS.items():
        existentes = {c["name"] for c in inspect(bind).get_columns(tabela)}
        for coluna in colunas:
            if coluna.name not in existentes:
                op.add_column(tabela, coluna)
    indices = {i["name"] for i in inspect(bind).get_indexes("atendimentos")}
    if "uq_atendimentos_fila" not in indices:
        # Uma fila gera no máximo um atendimento (B.6-004).
        op.create_index("uq_atendimentos_fila", "atendimentos", ["fila_id"], unique=True)


def downgrade() -> None:
    bind = op.get_bind()
    if "uq_atendimentos_fila" in {i["name"] for i in inspect(bind).get_indexes("atendimentos")}:
        op.drop_index("uq_atendimentos_fila", table_name="atendimentos")
    for tabela, colunas in COLUNAS.items():
        existentes = {c["name"] for c in inspect(bind).get_columns(tabela)}
        for coluna in reversed(colunas):
            if coluna.name in existentes:
                op.drop_column(tabela, coluna.name)
