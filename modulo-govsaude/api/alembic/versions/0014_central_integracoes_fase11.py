"""Fase 11: central de integrações (execuções e recortes da fila de correção).

Idempotente: cria ``integracao_execucoes`` e adiciona colunas a
``integracao_envios`` (tabela particionada: o ADD COLUMN no pai propaga).

Revision ID: 0014
Revises: 0013
Create Date: 2026-10-27
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import op
from app.models import Base

revision: str = "0014"
down_revision: str | None = "0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

COLUNAS = ["estabelecimento_id", "cidadao_id", "substituido_por_id"]


def upgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    if not insp.has_table("integracao_execucoes"):
        Base.metadata.tables["integracao_execucoes"].create(bind, checkfirst=True)
    existentes = {c["name"] for c in insp.get_columns("integracao_envios")}
    for nome in COLUNAS:
        if nome not in existentes:
            op.add_column("integracao_envios", sa.Column(nome, sa.Uuid(), nullable=True))
    indices = {i["name"] for i in insp.get_indexes("integracao_envios")}
    if "ix_integracao_envios_correcao" not in indices:
        op.create_index(
            "ix_integracao_envios_correcao",
            "integracao_envios",
            ["tenant_id", "estabelecimento_id", "situacao"],
        )


def downgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    if "ix_integracao_envios_correcao" in {
        i["name"] for i in insp.get_indexes("integracao_envios")
    }:
        op.drop_index("ix_integracao_envios_correcao", table_name="integracao_envios")
    existentes = {c["name"] for c in insp.get_columns("integracao_envios")}
    for nome in COLUNAS:
        if nome in existentes:
            op.drop_column("integracao_envios", nome)
    if insp.has_table("integracao_execucoes"):
        Base.metadata.tables["integracao_execucoes"].drop(bind, checkfirst=True)
