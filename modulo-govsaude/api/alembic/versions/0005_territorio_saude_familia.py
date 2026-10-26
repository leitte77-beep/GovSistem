"""Fase 3: território, famílias, domicílios e visitas.

Revision ID: 0005
Revises: 0004
"""
from __future__ import annotations
from alembic import op
from sqlalchemy import inspect
from app.models import Base

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None

TABELAS = ["territorios", "familias", "domicilios", "familias_domicilios", "familias_membros", "animais_domicilio", "visitas_domiciliares"]

def upgrade() -> None:
    bind = op.get_bind()
    existentes = set(inspect(bind).get_table_names())
    Base.metadata.create_all(bind=bind, tables=[Base.metadata.tables[n] for n in TABELAS if n not in existentes], checkfirst=True)

def downgrade() -> None:
    bind = op.get_bind()
    for nome in reversed(TABELAS):
        if inspect(bind).has_table(nome):
            Base.metadata.tables[nome].drop(bind, checkfirst=True)
