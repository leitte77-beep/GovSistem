"""Fase 9: imunização (vacinas, esquemas versionados, frascos, agendamentos, aplicações).

Idempotente: cria só as tabelas que faltam. O downgrade remove apenas as da Fase 9.

Revision ID: 0012
Revises: 0011
Create Date: 2026-10-26
"""

from __future__ import annotations

from collections.abc import Sequence

from sqlalchemy import inspect

from alembic import op
from app.models import Base

revision: str = "0012"
down_revision: str | None = "0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

NOVAS_TABELAS = [
    "vacinas",
    "esquemas_vacinais",
    "frascos_abertos",
    "agendamentos_vacina",
    "aplicacoes_vacina",
]


def upgrade() -> None:
    bind = op.get_bind()
    existentes = set(inspect(bind).get_table_names())
    Base.metadata.create_all(
        bind=bind,
        tables=[Base.metadata.tables[n] for n in NOVAS_TABELAS if n not in existentes],
        checkfirst=True,
    )


def downgrade() -> None:
    bind = op.get_bind()
    for nome in reversed(NOVAS_TABELAS):
        if inspect(bind).has_table(nome):
            Base.metadata.tables[nome].drop(bind, checkfirst=True)
